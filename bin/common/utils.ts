import { config } from "dotenv";
import { DateTime } from "luxon";
import fs from 'fs';
import crypto from 'crypto'
import hash from 'stable-hash'
import path from 'path'

config();

export function createErrorResponse(message: string, statusCode: number = 500) {
    return {
        error: true,
        status: statusCode,
        message,
        timestamp: new Date().toISOString()
    };
}
  
export function createSuccessResponse(data: any, message: string = "Operation successful") {
    return {
        success: true,
        status: 200,
        message,
        data,
        timestamp: new Date().toISOString()
    };
}

export function createGenericResponse(
    success: boolean,
    data: any = null,
    message: string = "Operation completed",
    statusCode: number = 200
) {
    return {
        success,
        status: statusCode,
        message,
        data,
        timestamp: new Date().toISOString()
    };
}

export function multerDirSafe(){
    const relativePath = process.env.MULTER_DIR || './cdn';
    const absolutePath = path.resolve(__dirname, '..', '..', relativePath);
    
    if (!fs.existsSync(absolutePath)){
        fs.mkdirSync(absolutePath, { recursive: true });
    }

    return absolutePath;
}

export function assetsDirSafe(){
    const relativePath = process.env.ASSETS_DIR || './assets';
    const absolutePath = path.resolve(__dirname, '..', '..', relativePath);
    
    if (!fs.existsSync(absolutePath)){
        fs.mkdirSync(absolutePath, { recursive: true });
    }

    return absolutePath;
}

export function verifyPackageExists(name: string){
    const MULTER_DIR = multerDirSafe();
    const instancePath = `${MULTER_DIR}/instances/${name}`;
    
    if (!fs.existsSync(instancePath)) {
        return false;
    }
    
    return true;
}

export function generatePackageHash(name: string): string {
    const MULTER_DIR = multerDirSafe();
    const instancePath = `${MULTER_DIR}/instances/${name}`;
    
    if (!fs.existsSync(instancePath)) {
        throw new Error(`Instance directory does not exist: ${instancePath}`);
    }
    
    const files = fs.readdirSync(instancePath);
    const weakHash = hash(files);
    const encodedHash = Buffer.from(weakHash.toString()).toString('base64');
    const safeHash = crypto.createHash('MD5').update(encodedHash).digest('hex');
    return safeHash;
}

export function getTimeWithTimezone(): Promise<{ time: string, timezone: string }> {
    return new Promise(async (resolve, reject) => {
        try{
            const ipFetch = await fetch("https://api.ipify.org?format=json");

            if (!ipFetch.ok) {
                throw new Error(`Failed to fetch IP address: ${ipFetch.statusText}`);
            }

            const ipResponse = await ipFetch.json();
            const zone = await fetch(`https://api.ipquery.io/${ipResponse.ip}`)
            const zoneResponse = await zone.json();

            if (zoneResponse.risk.is_vpn || zoneResponse.risk.is_proxy) {
                reject(new Error("VPN or proxy detected. This is not allowed."));
            }

            const currentTime = DateTime.now().setZone(zoneResponse.location.timezone).toISO() ?? "";
            resolve({
                time: currentTime,
                timezone: zoneResponse.location.timezone,
            });
        }
        catch (error) {
            console.error("[REACH - Utils]: Error fetching time with timezone:", error);
            reject(new Error("Failed to fetch time with timezone."));
        }
    })  
}

export function getAllFilesFromPath(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const allFiles: string[] = [];
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            allFiles.push(...getAllFilesFromPath(filePath));
        } else {
            allFiles.push(filePath);
        }
    });
    return allFiles;
}