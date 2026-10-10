import User from "../modal/userschema.js"
import { hashPassword } from "./auth.js";

const seedDatabase = async () => {
    try{
       const existingUsers = await User.find();
       if(existingUsers.length>0){
        console.log("Database already seeded. Skipping seeding process.");
        return;
       }

       const createdUsers = await User.insertMany([{
         name: "Shreekant Yadav",
         email: process.env.ADMIN_EMAIL ?? "admin@example.com",
         passwordHash: await hashPassword(process.env.ADMIN_PASSWORD ?? "change-this-password"),
         role: "admin",
       }]);
       console.log(`Seeded ${createdUsers.length} users into the database.`);



    }
    catch(error){
console.error(`Error seeding database: ${(error as Error).message}`);

    }
}

seedDatabase();