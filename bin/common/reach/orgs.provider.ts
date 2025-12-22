import { config } from "dotenv";
import { DateTime } from "luxon";
import { getDevelopersDB } from "../services/database.service";

config();

const DEVELOPERS_DB = getDevelopersDB();


export async function getOrganizationIdFromBID(betterID: string): Promise<string>{
    try{
        const documentOrg = await DEVELOPERS_DB.findDocuments("organizations", {
            $or: [
                { members: betterID },
                { members: { $elemMatch: { userId: betterID } } },
                { ownerId: betterID }
            ]
        });

        if(documentOrg.length === 0){
            throw new Error("There are no members within this organization.")
        }

        const id = documentOrg[0]._id.toString();
        return id;
    }
    catch (error) {
        throw error;
    }
}

export async function verifyTokenDate(tokenDate: DateTime) {
    const now = DateTime.now();
    const diff = now.diff(tokenDate, "minutes");

    if (diff.minutes > 60) {
        return false;
    }
    
    return true;
}
