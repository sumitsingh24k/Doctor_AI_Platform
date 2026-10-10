import mongoose from "mongoose";

interface IUser{
    name:string;
    email?:string;
    username?:string;
    passwordHash?:string;
    password?:number;
    role:"admin"|"doctor"|"patient";
    doctorId?:mongoose.Types.ObjectId;
    refreshTokenHash?:string|null;
    refreshTokenExpiresAt?:Date|null;

}

const userSchema=new mongoose.Schema<IUser>({
    name:{
        type:String,
        required:true,
    },
    email:{
        type:String,
        trim:true,
        lowercase:true,
        sparse:true,
        unique:true,
    },
    username:{
        type:String,
        required:false,

    },
    password:{ type:Number, required:false },
    passwordHash:{ type:String, required:false, select:false },
    role:{ type:String, enum:["admin","doctor","patient"], default:"doctor", required:true },
    doctorId:{ type:mongoose.Schema.Types.ObjectId, ref:"Doctor", default:null },
    refreshTokenHash:{ type:String, default:null, select:false },
    refreshTokenExpiresAt:{ type:Date, default:null, select:false },
})

const User=mongoose.model("User",userSchema);
export default User;