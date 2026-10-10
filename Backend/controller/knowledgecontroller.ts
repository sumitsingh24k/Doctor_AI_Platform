import { Request, Response } from "express";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFParse } from "pdf-parse";
import crypto from "node:crypto";
import { Doctor } from "../modal/doctordetails.js";
import DoctorKnowledge from "../modal/doctorknowledge.js";
import { uploadPdfToCloudinary } from "../lib/cloudinary.js";
import { getAgentContext } from "../lib/requestContext.js";

const getGeminiApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Knowledge-base features require GEMINI_API_KEY. Add it to Backend/.env and restart the server.");
  }
  return apiKey;
};

let embeddings: GoogleGenerativeAIEmbeddings | undefined;
const getEmbeddings = () => {
  embeddings ??= new GoogleGenerativeAIEmbeddings({
    apiKey: getGeminiApiKey(),
    modelName: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  });
  return embeddings;
};

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1200,
  chunkOverlap: 200,
});

let chatModel: ChatGoogleGenerativeAI | undefined;
const getChatModel = () => {
  chatModel ??= new ChatGoogleGenerativeAI({
    apiKey: getGeminiApiKey(),
    model: process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash",
    temperature: 0,
  });
  return chatModel;
};

const getDoctor = async () => {
  const context = getAgentContext();
  const doctor = context
    ? await Doctor.findOne({ _id: context.doctorId })
    : await Doctor.findOne();
  if (!doctor) {
    throw new Error("Doctor profile not found");
  }
  return doctor;
};

const cosineSimilarity = (left: number[], right: number[]) => {
  if (left.length !== right.length || left.length === 0) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue ** 2;
    rightMagnitude += rightValue ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const tokenize = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1)
  );

const keywordScore = (query: string, content: string) => {
  const queryTokens = tokenize(query);
  const contentTokens = tokenize(content);
  if (queryTokens.size === 0) return 0;

  let matches = 0;
  queryTokens.forEach((token) => {
    if (contentTokens.has(token)) matches += 1;
  });

  return matches / queryTokens.size;
};

const getModelText = (content: unknown) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String(part.text)
          : ""
      )
      .join("");
  }
  return "";
};

const rewriteQuery = async (query: string) => {
  try {
    const response = await getChatModel().invoke(
      `Rewrite this user's healthcare information question into one concise search query. Preserve important names, symptoms, services, timings, fees, and locations. Return only the rewritten query, without quotes or explanation.\n\nUser question: ${query}`
    );
    const rewritten = getModelText(response.content).trim();
    return rewritten || query;
  } catch (error) {
    console.error("Query rewriting failed:", error);
    return query;
  }
};

type RankedMatch = {
  content: string;
  sourceFileName: string;
  sourceUrl: string;
  documentType: string;
  category: string;
  language: string;
  tags: string[];
  vectorScore: number;
  keywordScore: number;
  hybridScore: number;
  rerankScore?: number;
};

type KnowledgeSearchInput = {
  query: string;
  documentType?: string;
  category?: string;
  language?: string;
  tags?: string[];
  topK?: number;
};

type KnowledgeIndexingStage =
  | "doctor_profile"
  | "pdf_extraction"
  | "chunking"
  | "embeddings"
  | "file_storage"
  | "database";

class KnowledgeIndexingError extends Error {
  constructor(
    public readonly stage: KnowledgeIndexingStage,
    public readonly originalError: unknown
  ) {
    super(`Knowledge indexing failed during ${stage}`);
  }
}

const runIndexingStage = async <T>(
  stage: KnowledgeIndexingStage,
  operation: () => Promise<T>
) => {
  try {
    return await operation();
  } catch (error) {
    throw new KnowledgeIndexingError(stage, error);
  }
};

const getSafeIndexingErrorDetail = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown provider error";
  const secrets = [
    process.env.CLOUDINARY_API_SECRET,
    process.env.CLOUDINARY_API_KEY,
    process.env.GEMINI_API_KEY,
  ].filter((value): value is string => Boolean(value));

  return secrets.reduce(
    // split/join keeps this compatible with the project's ES2020 target.
    (safeMessage, secret) => safeMessage.split(secret).join("[REDACTED]"),
    message
  ).slice(0, 500);
};

const rerankMatches = async (query: string, matches: RankedMatch[]) => {
  if (matches.length < 2) return matches;

  try {
    const candidates = matches
      .map((match, index) => `${index}. ${match.content}`)
      .join("\n\n");
    const response = await getChatModel().invoke(
      `Rank the following document chunks for the user's question. Return only a JSON array of chunk indexes in descending relevance order. Do not include markdown.\n\nQuestion: ${query}\n\nChunks:\n${candidates}`
    );
    const parsed = JSON.parse(getModelText(response.content).trim()) as unknown;

    if (!Array.isArray(parsed)) return matches;

    const order = parsed.filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 0 && value < matches.length
    );
    const used = new Set(order);
    const remaining = matches.map((_match, index) => index).filter((index) => !used.has(index));

    return [...order, ...remaining].map((index, rank) => ({
      ...matches[index],
      rerankScore: 1 - rank / Math.max(matches.length, 1),
    }));
  } catch (error) {
    console.error("Result re-ranking failed:", error);
    return matches;
  }
};

// Shared by the HTTP controller and the AI agent tool. Keeping retrieval here
// means both callers use identical query rewriting, ranking, and metadata rules.
export const searchDoctorKnowledgeForAssistant = async ({
  query,
  documentType,
  category,
  language,
  tags = [],
  topK = 4,
}: KnowledgeSearchInput) => {
  const doctor = await getDoctor();
  const rewrittenQuery = await rewriteQuery(query);
  const queryVector = await getEmbeddings().embedQuery(rewrittenQuery);
  const context = getAgentContext();
  const metadataFilter: Record<string, unknown> = { doctorId: doctor._id };

  if (documentType) metadataFilter.documentType = documentType;
  if (category) metadataFilter.category = category;
  if (language) metadataFilter.language = language;
  if (tags.length > 0) metadataFilter.tags = { $in: tags };

  const knowledge = await DoctorKnowledge.find(metadataFilter).lean();
  const safeTopK = Math.min(Math.max(topK || 4, 1), 8);
  const candidateMatches: RankedMatch[] = knowledge
    .map((item) => {
      const vectorScore = cosineSimilarity(queryVector, item.embedding);
      const lexicalScore = Math.max(
        keywordScore(query, item.content),
        keywordScore(rewrittenQuery, item.content)
      );
      return {
        content: item.content,
        sourceFileName: item.sourceFileName,
        sourceUrl: item.sourceUrl,
        documentType: item.documentType,
        category: item.category,
        language: item.language,
        tags: item.tags,
        vectorScore,
        keywordScore: lexicalScore,
        hybridScore: vectorScore * 0.7 + lexicalScore * 0.3,
      };
    })
    .sort((left, right) => right.hybridScore - left.hybridScore)
    .slice(0, Math.min(safeTopK * 2, 8));
  const matches = (await rerankMatches(rewrittenQuery, candidateMatches)).slice(0, safeTopK);

  return {
    query,
    rewrittenQuery,
    context: matches.map((match) => match.content).join("\n\n"),
    matches,
  };
};

export const ingestDoctorKnowledge = async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "A doctor information PDF is required in the 'file' form field",
      });
    }

    if (file.mimetype !== "application/pdf") {
      return res.status(400).json({ message: "Only PDF files are allowed" });
    }

    const doctor = await runIndexingStage("doctor_profile", getDoctor);
    const documentType =
      typeof req.body.documentType === "string" && req.body.documentType.trim()
        ? req.body.documentType.trim().toLowerCase()
        : "doctor-knowledge";
    const category =
      typeof req.body.category === "string" && req.body.category.trim()
        ? req.body.category.trim().toLowerCase()
        : "general";
    const language =
      typeof req.body.language === "string" && req.body.language.trim()
        ? req.body.language.trim().toLowerCase()
        : "en";
    const tags = typeof req.body.tags === "string"
      ? req.body.tags.split(",").map((tag: string) => tag.trim().toLowerCase()).filter(Boolean)
      : [];
    const text = await runIndexingStage("pdf_extraction", async () => {
      const pdfParser = new PDFParse({ data: file.buffer });

      try {
        const parsedPdf = await pdfParser.getText();
        return parsedPdf.text.replace(/\s+/g, " ").trim();
      } finally {
        await pdfParser.destroy();
      }
    });

    if (!text) {
      return res.status(400).json({
        message: "The PDF does not contain readable text",
      });
    }

    const contents = await runIndexingStage("chunking", async () => {
      const documents = await splitter.createDocuments([text]);
      const chunks = documents
        .map((document) => document.pageContent.trim())
        .filter(Boolean);

      if (chunks.length === 0) {
        throw new Error("The PDF did not produce any indexable text chunks");
      }

      return chunks;
    });
    const vectors = await runIndexingStage("embeddings", () => getEmbeddings().embedDocuments(contents));
    const publicId = `${doctor._id.toString()}-${Date.now()}-${crypto.randomUUID()}`;
    const upload = await runIndexingStage("file_storage", () =>
      uploadPdfToCloudinary(
        file.buffer,
        publicId,
        "doctor-platform/doctor-knowledge"
      )
    );

    await runIndexingStage("database", async () => {
      await DoctorKnowledge.insertMany(
        contents.map((content, chunkIndex) => ({
          doctorId: doctor._id,
          sourceFileName: file.originalname,
          sourcePublicId: upload.public_id,
          sourceUrl: upload.secure_url,
          chunkIndex,
          content,
          embedding: vectors[chunkIndex],
          documentType,
          category,
          language,
          tags,
        }))
      );

      await DoctorKnowledge.deleteMany({
        doctorId: doctor._id,
        sourceFileName: file.originalname,
        sourcePublicId: { $ne: upload.public_id },
      });
    });

    return res.status(201).json({
      message: "Doctor PDF indexed successfully for RAG and voice agent",
      fileName: file.originalname,
      chunks: contents.length,
      sourceUrl: upload.secure_url,
      metadata: { documentType, category, language, tags },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to index doctor PDF";

    if (message === "Doctor profile not found") {
      return res.status(404).json({ message });
    }

    if (error instanceof KnowledgeIndexingError) {
      console.error(`Doctor knowledge indexing failed at ${error.stage}:`, error.originalError);
      return res.status(500).json({
        message: "Unable to index doctor PDF",
        stage: error.stage,
        // The client needs the failed stage to tell a Cloudinary setup problem
        // apart from PDF parsing, Gemini embedding, or MongoDB errors. Provider
        // messages are redacted before leaving the server.
        detail: getSafeIndexingErrorDetail(error.originalError),
      });
    }

    console.error(error);
    return res.status(500).json({ message: "Unable to index doctor PDF" });
  }
};

export const searchDoctorKnowledge = async (req: Request, res: Response) => {
  try {
    const query = typeof req.body.query === "string" ? req.body.query.trim() : "";

    if (!query) {
      return res.status(400).json({ message: "A query is required" });
    }

    const filters: Pick<KnowledgeSearchInput, "documentType" | "category" | "language"> = {};
    for (const field of ["documentType", "category", "language"] as const) {
      if (typeof req.body[field] === "string" && req.body[field].trim()) {
        filters[field] = req.body[field].trim().toLowerCase();
      }
    }
    const requestedTags = Array.isArray(req.body.tags)
      ? req.body.tags.map((tag: unknown) => String(tag).toLowerCase())
      : typeof req.body.tags === "string"
        ? req.body.tags.split(",").map((tag: string) => tag.trim().toLowerCase()).filter(Boolean)
        : [];
    const result = await searchDoctorKnowledgeForAssistant({
      query,
      ...filters,
      tags: requestedTags,
      topK: Number(req.body.topK) || 4,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unable to search doctor knowledge";

    if (message === "Doctor profile not found") {
      return res.status(404).json({ message });
    }

    return res.status(500).json({ message: "Unable to search doctor knowledge" });
  }
};
