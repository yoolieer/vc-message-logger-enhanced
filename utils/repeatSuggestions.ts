/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { LoggedMessage, LoggedMessageJSON } from "../types";

export interface RepeatSuggestion {
    content: string;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
}

const counts = new Map<string, RepeatSuggestion>();
const suggestions = new Map<string, RepeatSuggestion>();
const listeners = new Set<() => void>();

export function recordRepeatSuggestion(message: LoggedMessage | LoggedMessageJSON, threshold: number) {
    if (threshold <= 0) return;

    const { content } = message;
    if (typeof content !== "string" || content.trim().length === 0) return;

    const now = new Date().toISOString();
    const record = counts.get(content) ?? {
        content,
        count: 0,
        firstSeenAt: now,
        lastSeenAt: now
    };

    record.count++;
    record.lastSeenAt = now;
    counts.set(content, record);

    if (record.count >= threshold) {
        suggestions.set(content, { ...record });
        emitChange();
    }
}

export function getRepeatSuggestions() {
    return Array.from(suggestions.values())
        .sort((a, b) => b.count - a.count || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}

export function removeRepeatSuggestion(content: string) {
    suggestions.delete(content);
    emitChange();
}

export function clearRepeatSuggestions() {
    suggestions.clear();
    emitChange();
}

export function subscribeRepeatSuggestions(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function emitChange() {
    for (const listener of listeners)
        listener();
}
