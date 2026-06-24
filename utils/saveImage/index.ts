/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { MessageAttachment } from "@vencord/discord-types";

import { Flogger, settings } from "../..";
import { LoggedAttachment, LoggedMessage, LoggedMessageJSON } from "../../types";
import { getMimeTypeFromBytes, getMimeTypeFromExtension, isBrowserUnsupportedImageMimeType } from "../fileTypes";
import { memoize } from "../memoize";
import { deleteImage, downloadAttachment, getImage, } from "./ImageManager";

export function getFileExtension(str: string) {
    let pathname = str;

    try {
        pathname = new URL(str).pathname;
    } catch {
        pathname = str.split(/[?#]/)[0];
    }

    const matches = pathname.match(/(\.[a-zA-Z0-9]+)$/);
    if (!matches) return null;

    return matches[1];
}

export function isAttachmentGoodToCache(attachment: MessageAttachment, fileExtension: string) {
    if (attachment.size > settings.store.attachmentSizeLimitInMegabytes * 1024 * 1024) {
        Flogger.log("Attachment too large to cache", attachment.filename);
        return false;
    }
    const attachmentFileExtensionsStr = settings.store.attachmentFileExtensions.trim();

    if (attachmentFileExtensionsStr === "")
        return true;

    const allowedFileExtensions = attachmentFileExtensionsStr
        .split(",")
        .map(extension => extension.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);

    if (fileExtension.startsWith(".")) {
        fileExtension = fileExtension.slice(1);
    }
    fileExtension = fileExtension.toLowerCase();

    if (!fileExtension || !allowedFileExtensions.includes(fileExtension)) {
        Flogger.log("Attachment not in allowed file extensions", attachment.filename);
        return false;
    }

    return true;
}

export async function cacheMessageImages(message: LoggedMessage | LoggedMessageJSON) {
    try {
        for (const attachment of message.attachments) {
            const fileExtension = getFileExtension(attachment.filename ?? attachment.url) ?? attachment.content_type?.split("/")?.[1] ?? ".png";

            if (!isAttachmentGoodToCache(attachment, fileExtension)) {
                Flogger.log("skipping", attachment.filename);
                continue;
            }

            attachment.oldUrl = attachment.url;
            attachment.oldProxyUrl = attachment.proxy_url;

            // only normal urls work if theres a charset in the content type /shrug
            if (attachment.content_type?.includes(";")) {
                attachment.proxy_url = attachment.url;
            } else {
                // apparently proxy urls last longer
                attachment.url = attachment.proxy_url;
                attachment.proxy_url = attachment.url;
            }

            attachment.fileExtension = fileExtension;

            const path = await downloadAttachment(attachment);

            if (!path) {
                Flogger.error("Failed to cache attachment", attachment);
                continue;
            }

            attachment.path = path;
            attachment.fileExtension = getFileExtension(path) ?? attachment.fileExtension;
        }

    } catch (error) {
        Flogger.error("Error caching message images:", error);
    }
}

export async function deleteMessageImages(message: LoggedMessage | LoggedMessageJSON) {
    for (let i = 0; i < message.attachments.length; i++) {
        const attachment = message.attachments[i];
        await deleteImage(attachment.id);
    }
}

export function restoreExternalAttachmentUrl(attachment: LoggedAttachment) {
    if (attachment.oldUrl)
        attachment.url = attachment.oldUrl;

    if (attachment.oldProxyUrl)
        attachment.proxy_url = attachment.oldProxyUrl;
    else if (attachment.oldUrl)
        attachment.proxy_url = attachment.oldUrl;
}

export const getAttachmentBlobUrl = memoize(async (attachment: LoggedAttachment) => {
    const imageData = await getImage(attachment.id, attachment.fileExtension);
    if (!imageData) return null;

    const mimeType = getMimeTypeFromBytes(imageData)
        ?? getMimeTypeFromExtension(attachment.fileExtension)
        ?? attachment.content_type?.split(";")?.[0]?.trim()?.toLowerCase()
        ?? null;

    if (isBrowserUnsupportedImageMimeType(mimeType)) {
        Flogger.warn("Cached attachment is not browser-displayable; using original Discord URL fallback", attachment.id, mimeType);
        return null;
    }

    const blob = new Blob([imageData], mimeType ? { type: mimeType } : undefined);
    const resUrl = URL.createObjectURL(blob);

    return resUrl;
});
