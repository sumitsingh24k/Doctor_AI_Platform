import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  api_key: process.env.CLOUDINARY_API_KEY ?? "",
  api_secret: process.env.CLOUDINARY_API_SECRET ?? "",
};

cloudinary.config(cloudinaryConfig);

const getCloudinaryConfig = () => {
  if (
    !cloudinaryConfig.cloud_name ||
    !cloudinaryConfig.api_key ||
    !cloudinaryConfig.api_secret
  ) {
    throw new Error("Cloudinary environment variables are not configured");
  }
};

export const uploadPdfToCloudinary = (
  buffer: Buffer,
  publicId: string,
  folder = "doctor-platform/patient-documents"
): Promise<UploadApiResponse> => {
  getCloudinaryConfig();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "raw",
        type: "private",
        format: "pdf",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary did not return an upload result"));
          return;
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
};
