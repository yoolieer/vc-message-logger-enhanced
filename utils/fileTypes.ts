export function toUint8Array(data: unknown): Uint8Array | null {
    if (data instanceof Uint8Array)
        return data;

    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);

    if (ArrayBuffer.isView(data))
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    return null;
}

function hasBytes(bytes: Uint8Array, offset: number, values: number[]) {
    if (bytes.length < offset + values.length)
        return false;

    return values.every((value, index) => bytes[offset + index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
    if (bytes.length < offset + length)
        return "";

    let value = "";
    for (let i = 0; i < length; i++)
        value += String.fromCharCode(bytes[offset + i]);

    return value;
}

export function getMimeTypeFromBytes(data: unknown): string | null {
    const bytes = toUint8Array(data);
    if (!bytes)
        return null;

    if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        return "image/png";

    if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff]))
        return "image/jpeg";

    if (readAscii(bytes, 0, 6) === "GIF87a" || readAscii(bytes, 0, 6) === "GIF89a")
        return "image/gif";

    if (readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP")
        return "image/webp";

    if (hasBytes(bytes, 0, [0x49, 0x44, 0x33]) || hasBytes(bytes, 0, [0xff, 0xfb]))
        return "audio/mpeg";

    if (readAscii(bytes, 0, 4) === "OggS")
        return "audio/ogg";

    if (readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WAVE")
        return "audio/wav";

    if (readAscii(bytes, 4, 4) === "ftyp") {
        const brands: string[] = [];
        const maxBrandBytes = Math.min(bytes.length, 64);
        for (let offset = 8; offset + 4 <= maxBrandBytes; offset += 4)
            brands.push(readAscii(bytes, offset, 4).toLowerCase());

        if (brands.includes("avif") || brands.includes("avis"))
            return "image/avif";

        const heicBrands = ["heic", "heix", "hevc", "hevx", "heis", "heim", "mif1", "msf1"];
        if (brands.some(brand => heicBrands.includes(brand)))
            return "image/heic";

        const mp4Brands = ["mp42", "mp41", "isom", "iso2", "avc1"];
        if (brands.some(brand => mp4Brands.includes(brand)))
            return "video/mp4";
    }

    return null;
}

export function getMimeTypeFromExtension(fileExtension?: string | null): string | null {
    const extension = normalizeExtension(fileExtension);
    switch (extension) {
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".webp":
            return "image/webp";
        case ".avif":
            return "image/avif";
        case ".heic":
            return "image/heic";
        case ".heif":
            return "image/heif";
        case ".mp4":
            return "video/mp4";
        case ".webm":
            return "video/webm";
        case ".mp3":
            return "audio/mpeg";
        case ".ogg":
            return "audio/ogg";
        case ".wav":
            return "audio/wav";
        default:
            return null;
    }
}

export function getExtensionFromMimeType(contentType?: string | null): string | null {
    const mime = contentType?.split(";")?.[0]?.trim()?.toLowerCase();
    switch (mime) {
        case "image/png":
            return ".png";
        case "image/jpeg":
        case "image/jpg":
            return ".jpg";
        case "image/gif":
            return ".gif";
        case "image/webp":
            return ".webp";
        case "image/avif":
            return ".avif";
        case "image/heic":
            return ".heic";
        case "image/heif":
            return ".heif";
        case "video/mp4":
            return ".mp4";
        case "video/webm":
            return ".webm";
        case "audio/mpeg":
        case "audio/mp3":
            return ".mp3";
        case "audio/ogg":
            return ".ogg";
        case "audio/wav":
        case "audio/wave":
        case "audio/x-wav":
            return ".wav";
        default:
            return null;
    }
}

export function getExtensionFromBytes(data: unknown): string | null {
    return getExtensionFromMimeType(getMimeTypeFromBytes(data));
}

export function normalizeExtension(fileExtension?: string | null): string | null {
    if (!fileExtension)
        return null;

    const extension = fileExtension.trim().toLowerCase();
    if (!extension)
        return null;

    return extension.startsWith(".") ? extension : `.${extension}`;
}

export function isBrowserUnsupportedImageMimeType(mimeType?: string | null) {
    return mimeType === "image/heic" || mimeType === "image/heif";
}
