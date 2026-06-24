/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface KeywordRegexError {
    index: number;
    pattern: string;
    error: string;
}

interface CompiledKeywordRegexes {
    errors: KeywordRegexError[];
    patterns: string[];
    regexes: RegExp[];
}

let cachedKey = "";
let cachedRegexes: CompiledKeywordRegexes = {
    errors: [],
    patterns: [],
    regexes: []
};

export function normalizeKeywordRegexPatterns(value: unknown): string[] {
    if (Array.isArray(value))
        return value.filter((pattern): pattern is string => typeof pattern === "string" && pattern.length > 0);

    if (typeof value !== "string") return [];

    const parsed = parseKeywordRegexJson(value);
    return parsed.patterns ?? [];
}

export function parseKeywordRegexJson(value: string): { patterns?: string[]; error?: string; } {
    let parsed: unknown;

    try {
        parsed = JSON.parse(value);
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }

    if (!Array.isArray(parsed))
        return { error: "Expected a JSON array of strings." };

    const invalidIndex = parsed.findIndex(item => typeof item !== "string");
    if (invalidIndex !== -1)
        return { error: `Item ${invalidIndex + 1} is not a string.` };

    return {
        patterns: parsed.filter((pattern: string) => pattern.length > 0)
    };
}

export function compileKeywordRegexPatterns(value: unknown): CompiledKeywordRegexes {
    const patterns = normalizeKeywordRegexPatterns(value);
    const key = JSON.stringify(patterns);

    if (key === cachedKey) return cachedRegexes;

    const errors: KeywordRegexError[] = [];
    const regexes: RegExp[] = [];

    patterns.forEach((pattern, index) => {
        try {
            regexes.push(new RegExp(pattern));
        } catch (e) {
            errors.push({
                index,
                pattern,
                error: e instanceof Error ? e.message : String(e)
            });
        }
    });

    cachedKey = key;
    cachedRegexes = { errors, patterns, regexes };
    return cachedRegexes;
}

export function messageMatchesKeywordRegex(message: any, patterns: unknown): boolean {
    if (!message) return false;

    const { regexes } = compileKeywordRegexPatterns(patterns);
    if (!regexes.length) return false;

    return getMessageContents(message).some(content => regexes.some(regex => regex.test(content)));
}

export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function makeExactContentRegex(content: string): string {
    return `^${escapeRegex(content)}$`;
}

function getMessageContents(message: any): string[] {
    const contents: string[] = [];

    if (typeof message.content === "string" && message.content.length > 0)
        contents.push(message.content);

    if (Array.isArray(message.editHistory)) {
        for (const edit of message.editHistory) {
            if (typeof edit?.content === "string" && edit.content.length > 0)
                contents.push(edit.content);
        }
    }

    return contents;
}
