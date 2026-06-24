/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, Settings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { OptionType } from "@utils/types";
import { Alerts, Forms, TextArea, Toasts, useEffect, useState } from "@webpack/common";

import { Native } from ".";
import { openLogModal } from "./components/LogsModal";
import { ImageCacheDir, LogsDir } from "./components/settings/FolderSelectInput";
import { openUpdaterModal } from "./components/UpdaterModal";
import { clearMessagesIDB } from "./db";
import { DEFAULT_IMAGE_CACHE_DIR } from "./utils/constants";
import { compileKeywordRegexPatterns, makeExactContentRegex, normalizeKeywordRegexPatterns, parseKeywordRegexJson } from "./utils/keywordFilters";
import { clearRepeatSuggestions, getRepeatSuggestions, removeRepeatSuggestion, RepeatSuggestion, subscribeRepeatSuggestions } from "./utils/repeatSuggestions";
import { exportLogs, importLogs } from "./utils/settingsUtils";

const RepeatSuggestionsModalRoot = ModalRoot as any;
const RepeatSuggestionsModalHeader = ModalHeader as any;
const RepeatSuggestionsModalContent = ModalContent as any;
const RepeatSuggestionsModalFooter = ModalFooter as any;

function ImportLogsButton() {
    const [loading, setLoading] = useState(false);

    return (
        <Button
            disabled={loading}
            onClick={async () => {
                setLoading(true);
                try {
                    await importLogs();
                } finally {
                    setLoading(false);
                }
            }}
        >
            {loading ? "Importing..." : "Import Logs"}
        </Button>
    );
}

function ExportLogsButton() {
    const [loading, setLoading] = useState(false);

    return (
        <Button
            disabled={loading}
            onClick={async () => {
                setLoading(true);
                try {
                    await exportLogs();
                } finally {
                    setLoading(false);
                }
            }}
        >
            {loading ? "Exporting..." : "Export Logs"}
        </Button>
    );
}

function KeywordRegexBlacklistInput({ setValue }: { setValue(value: string[]): void; }) {
    const { keywordRegexBlacklist } = settings.use(["keywordRegexBlacklist"]);
    const [rawValue, setRawValue] = useState(() => JSON.stringify(normalizeKeywordRegexPatterns(keywordRegexBlacklist), null, 4));

    const parsed = parseKeywordRegexJson(rawValue);
    const regexErrors = parsed.patterns ? compileKeywordRegexPatterns(parsed.patterns).errors : [];

    function handleChange(value: string) {
        setRawValue(value);

        const next = parseKeywordRegexJson(value);
        if (next.patterns)
            setValue(next.patterns);
    }

    return (
        <section>
            <Forms.FormTitle tag="h3">Keyword Regex Blacklist</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: 8 }}>
                JSON array of JavaScript regular expression patterns. Messages matching any valid pattern will not be logged.
            </Forms.FormText>
            <TextArea
                value={rawValue}
                onChange={handleChange}
                placeholder={"[\"spam\", \"^ad\"]"}
                rows={6}
                spellCheck={false}
            />
            {parsed.error && (
                <Forms.FormText style={{ marginTop: 8, color: "var(--text-feedback-critical)" }}>
                    Invalid JSON: {parsed.error}
                </Forms.FormText>
            )}
            {!parsed.error && regexErrors.length > 0 && (
                <Forms.FormText style={{ marginTop: 8, color: "var(--text-feedback-critical)" }}>
                    Invalid regex skipped: {regexErrors.map(error => `${error.index + 1}: ${error.error}`).join("; ")}
                </Forms.FormText>
            )}
        </section>
    );
}

function addKeywordRegexPattern(pattern: string) {
    const patterns = normalizeKeywordRegexPatterns(settings.store.keywordRegexBlacklist);

    if (patterns.includes(pattern)) {
        Toasts.show({
            id: Toasts.genId(),
            type: Toasts.Type.MESSAGE,
            message: "Keyword regex is already blacklisted."
        });
        return false;
    }

    settings.store.keywordRegexBlacklist = [...patterns, pattern];
    Toasts.show({
        id: Toasts.genId(),
        type: Toasts.Type.SUCCESS,
        message: "Added keyword regex blacklist entry."
    });
    return true;
}

function RepeatSuggestionRow({ suggestion }: { suggestion: RepeatSuggestion; }) {
    return (
        <div style={{ padding: "12px 0", borderTop: "1px solid var(--background-modifier-accent)" }}>
            <Forms.FormTitle tag="h5">
                {suggestion.count} logs - First {new Date(suggestion.firstSeenAt).toLocaleString()} - Latest {new Date(suggestion.lastSeenAt).toLocaleString()}
            </Forms.FormTitle>
            <pre
                style={{
                    background: "var(--background-secondary)",
                    borderRadius: 4,
                    margin: "8px 0",
                    maxHeight: 120,
                    overflow: "auto",
                    padding: 8,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                }}
            >
                {suggestion.content}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
                <Button
                    size="small"
                    onClick={() => {
                        if (addKeywordRegexPattern(makeExactContentRegex(suggestion.content)))
                            removeRepeatSuggestion(suggestion.content);
                    }}
                >
                    Add Exact Match To Blacklist
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    onClick={() => removeRepeatSuggestion(suggestion.content)}
                >
                    Remove
                </Button>
            </div>
        </div>
    );
}

function RepeatSuggestionsModal({ modalProps }: { modalProps: any; }) {
    const [, forceUpdate] = useState(0);

    useEffect(() => subscribeRepeatSuggestions(() => forceUpdate(Date.now())), []);

    const suggestions = getRepeatSuggestions();

    return (
        <RepeatSuggestionsModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <RepeatSuggestionsModalHeader>
                <Forms.FormTitle tag="h3">Repeated Content History</Forms.FormTitle>
            </RepeatSuggestionsModalHeader>
            <RepeatSuggestionsModalContent>
                {suggestions.length === 0
                    ? (
                        <Forms.FormText>
                            No repeated logged content has reached the configured threshold in this session.
                        </Forms.FormText>
                    )
                    : suggestions.map(suggestion => (
                        <RepeatSuggestionRow key={suggestion.content} suggestion={suggestion} />
                    ))}
            </RepeatSuggestionsModalContent>
            <RepeatSuggestionsModalFooter>
                <Button
                    variant="dangerSecondary"
                    disabled={suggestions.length === 0}
                    onClick={clearRepeatSuggestions}
                >
                    Clear History
                </Button>
            </RepeatSuggestionsModalFooter>
        </RepeatSuggestionsModalRoot>
    );
}

function openRepeatSuggestionsModal() {
    openModal(modalProps => <RepeatSuggestionsModal modalProps={modalProps} />);
}

export const settings = definePluginSettings({
    checkForUpdate: {
        type: OptionType.COMPONENT,
        description: "Check for update",
        component: () =>
            <Button onClick={() => openUpdaterModal()}>
                Check For Updates
            </Button>
    },
    saveMessages: {
        default: true,
        type: OptionType.BOOLEAN,
        description: "Wether to save the deleted and edited messages.",
    },

    saveImages: {
        type: OptionType.BOOLEAN,
        description: "Save attachments from deleted, edited, and ghost ping logs.",
        default: false
    },

    sortNewest: {
        default: true,
        type: OptionType.BOOLEAN,
        description: "Sort logs by newest.",
    },

    cacheMessagesFromServers: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "Usually message logger only logs from whitelisted ids and dms, enabling this would mean it would log messages from all servers as well. Note that this may cause the cache to exceed its limit, resulting in some messages being missed. If you are in a lot of servers, this may significantly increase the chances of messages being logged, which can result in a large message record and the inclusion of irrelevant messages.",
    },

    keywordRegexBlacklist: {
        default: [] as string[],
        type: OptionType.COMPONENT,
        component: props => <KeywordRegexBlacklistInput setValue={props.setValue} />
    },

    repeatSuggestionThreshold: {
        default: 3,
        type: OptionType.NUMBER,
        description: "How many times the same logged message content must appear before it is shown in the repeated content history. 0 disables this history.",
        isValid(value) {
            const number = Number(value);
            return Number.isInteger(number) && number >= 0
                ? true
                : "Enter a whole number greater than or equal to 0.";
        }
    },

    openRepeatSuggestions: {
        type: OptionType.COMPONENT,
        component: () =>
            <Button onClick={openRepeatSuggestionsModal}>
                Open Repeated Content History
            </Button>
    },

    autoCheckForUpdates: {
        default: true,
        type: OptionType.BOOLEAN,
        description: "Automatically check for updates on startup.",
    },

    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Whether to ignore messages by bots",
        default: false,
        onChange() {
            // we will be handling the ignoreBots now (enabled or not) so the original messageLogger shouldnt
            Settings.plugins.MessageLogger.ignoreBots = false;
        }
    },

    ignoreSelf: {
        type: OptionType.BOOLEAN,
        description: "Whether to ignore messages by yourself",
        default: false,
        onChange() {
            Settings.plugins.MessageLogger.ignoreSelf = false;
        }
    },

    ignoreMutedGuilds: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "Messages in muted guilds will not be logged. Whitelisted users/channels in muted guilds will still be logged."
    },

    ignoreMutedCategories: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "Messages in channels belonging to muted categories will not be logged. Whitelisted users/channels in muted guilds will still be logged."
    },

    ignoreMutedChannels: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "Messages in muted channels will not be logged. Whitelisted users/channels in muted guilds will still be logged."
    },

    alwaysLogDirectMessages: {
        default: true,
        type: OptionType.BOOLEAN,
        description: "Always log DMs",
    },

    alwaysLogCurrentChannel: {
        default: true,
        type: OptionType.BOOLEAN,
        description: "Always log current selected channel. Blacklisted channels/users will still be ignored.",
    },

    permanentlyRemoveLogByDefault: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "Vencord's base MessageLogger remove log button wiil delete logs permanently",
    },

    hideMessageFromMessageLoggers: {
        default: false,
        type: OptionType.BOOLEAN,
        description: "When enabled, a context menu button will be added to messages to allow you to delete messages without them being logged by other loggers. Might not be safe, use at your own risk."
    },

    ShowLogsButton: {
        default: true,
        type: OptionType.BOOLEAN,
        description: "Toggle to whenever show the toolbox or not",
        restartNeeded: true,
    },

    messagesToDisplayAtOnceInLogs: {
        default: 100,
        type: OptionType.NUMBER,
        description: "Number of messages to display at once in logs & number of messages to load when loading more messages in logs.",
    },

    hideMessageFromMessageLoggersDeletedMessage: {
        default: "redacted eh",
        type: OptionType.STRING,
        description: "The message content to replace the message with when using the hide message from message loggers feature.",
    },

    messageLimit: {
        default: 200,
        type: OptionType.NUMBER,
        description: "Maximum number of messages to save. Older messages are deleted when the limit is reached. 0 means there is no limit"
    },

    attachmentSizeLimitInMegabytes: {
        default: 12,
        type: OptionType.NUMBER,
        description: "Maximum size of an attachment in megabytes to save. Attachments larger than this size will not be saved."
    },

    attachmentFileExtensions: {
        default: "png,jpg,jpeg,gif,webp,mp4,webm,mp3,ogg,wav",
        type: OptionType.STRING,
        description: "Comma separated list of file extensions to save. Attachments with file extensions not in this list will not be saved. Leave empty to save all attachments."
    },

    cacheLimit: {
        default: 1000,
        type: OptionType.NUMBER,
        description: "Maximum number of messages to store in the cache. Older messages are deleted when the limit is reached. This helps reduce memory usage and improve performance. 0 means there is no limit",
    },

    whitelistedIds: {
        default: "",
        type: OptionType.STRING,
        description: "Comma separated server, channel, or user IDs to always allow. Spaces around IDs are ignored."
    },

    blacklistedIds: {
        default: "",
        type: OptionType.STRING,
        description: "Comma separated server, channel, or user IDs to ignore. Use this for channel blacklists. Spaces around IDs are ignored."
    },

    imageCacheDir: {
        type: OptionType.COMPONENT,
        description: "Select saved images directory",
        component: ErrorBoundary.wrap(ImageCacheDir) as any
    },

    logsDir: {
        type: OptionType.COMPONENT,
        description: "Select logs directory",
        component: ErrorBoundary.wrap(LogsDir) as any
    },

    importLogs: {
        type: OptionType.COMPONENT,
        description: "Import Logs From File",
        component: ImportLogsButton
    },

    exportLogs: {
        type: OptionType.COMPONENT,
        description: "Export Logs From IndexedDB",
        component: ExportLogsButton
    },

    openLogs: {
        type: OptionType.COMPONENT,
        description: "Open Logs",
        component: () =>
            <Button onClick={() => openLogModal()}>
                Open Logs
            </Button>
    },
    openImageCacheFolder: {
        type: OptionType.COMPONENT,
        description: "Opens the image cache directory",
        component: () =>
            <Button
                disabled={
                    IS_WEB
                    || settings.store.imageCacheDir == null
                    || settings.store.imageCacheDir === DEFAULT_IMAGE_CACHE_DIR
                }
                onClick={() => Native.showItemInFolder(settings.store.imageCacheDir)}
            >
                Open Image Cache Folder
            </Button>
    },

    clearLogs: {
        type: OptionType.COMPONENT,
        description: "Clear Logs",
        component: () =>
            <Button
                variant="dangerPrimary"
                onClick={() => Alerts.show({
                    title: "Clear Logs",
                    body: "Are you sure you want to clear all logs?",
                    // @ts-ignore
                    confirmVariant: "critical-primary",
                    confirmText: "Clear",
                    cancelText: "Cancel",
                    onConfirm: () => {
                        clearMessagesIDB();
                    },
                })}
            >
                Clear Logs
            </Button>
    },

});
