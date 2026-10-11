import mongoose, { Types } from "mongoose";

interface IDoctor{
    _id: Types.ObjectId;
    name:string;
    specialization:string;
    qualification:string;
    clinicAddress:string;
    clinicName:string;
    aboutDoctor:string;
    clinicOpeningTime:string;
    clinicClosingTime:string;
    clinicTimeZone?:string;
    createdby: Types.ObjectId;
    googleRefreshToken?: string | null;
    googleCalendarId?: string | null;
    setupComplete?: boolean;
    appointmentDurationMinutes?: number;
    clinicLatitude?: number;
    clinicLongitude?: number;
    assistantName?: string;
    assistantWelcome?: string;
    assistantInstructions?: string;
    assistantLanguages?: string[];
    assistantNodeNotes?: Map<string, string>;
    
}

const doctorSchema=new mongoose.Schema<IDoctor>({
name:{
    type:String,
    required:true,
},
specialization:{
    type:String,
   
},
qualification:{
    type:String,
    required:true,
},
clinicAddress:{
    type:String,
    required:true,
},

clinicName:{
    type:String,
    required:true,
},
aboutDoctor:{
    type:String,
    required:true,
},

clinicOpeningTime:{
    type:String,
    required:true,
},

clinicClosingTime:{
    type:String,
    required:true,
},

clinicTimeZone:{
    type:String,
    default: process.env.GOOGLE_CALENDAR_TIME_ZONE || "Asia/Kolkata",
},

googleRefreshToken:{
    type:String,
    default:null,
},

googleCalendarId:{
    type:String,
    default:"primary",
},

setupComplete: {
    type: Boolean,
    default: false,
},

appointmentDurationMinutes:{
    type:Number,
    min:5,
    max:240,
    default:30,
},

clinicLatitude:{
    type:Number,
    min:-90,
    max:90,
},

clinicLongitude:{
    type:Number,
    min:-180,
    max:180,
},

assistantName: { type: String, default: "Clinic assistant", trim: true, maxlength: 60 },
assistantWelcome: { type: String, default: "Hello, how can I help you today?", trim: true, maxlength: 240 },
assistantInstructions: { type: String, default: "", trim: true, maxlength: 1200 },
assistantLanguages: { type: [String], default: ["en-IN", "hi-IN"] },
assistantNodeNotes: { type: Map, of: String, default: {} },



}       )


export const Doctor=mongoose.model("Doctor",doctorSchema);
    
