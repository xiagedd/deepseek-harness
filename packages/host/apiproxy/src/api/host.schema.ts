/**
 * host domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { DirectoryEntry, FsEntry } from './host.ts'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** host.describe request payload (empty object literal). */
export const hostDescribeRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'host.describe'>>>

/** host.describe response value. */
export const hostDescribeValueSchema = z.object({
  version: z.string(),
  cwd: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  attachedSessions: z.number().int().nonnegative(),
  canOpenPath: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.describe'>>>

/** host.pickDirectory request payload (empty object literal). */
export const hostPickDirectoryRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'host.pickDirectory'>>>

/** host.pickDirectory response value; null means the user cancelled. */
export const hostPickDirectoryValueSchema = z.object({
  path: z.string().nullable(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.pickDirectory'>>>

/** Directory row shared by listing entries and breadcrumb crumbs. */
export const directoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  hidden: z.boolean(),
}) satisfies z.ZodType<Wire<DirectoryEntry>>

/** host.listDirectory request payload; an absent path lists the home directory. */
export const hostListDirectoryRequestSchema = z.object({
  path: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.listDirectory'>>>

/** host.listDirectory response value. */
export const hostListDirectoryValueSchema = z.object({
  path: z.string(),
  home: z.string(),
  crumbs: z.array(directoryEntrySchema),
  entries: z.array(directoryEntrySchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.listDirectory'>>>

/** host.createDirectory request payload: name must be one plain path segment. */
export const hostCreateDirectoryRequestSchema = z.object({
  path: z.string(),
  name: z.string(),
}).refine(
  payload => payload.name.trim() !== '' && payload.name !== '.' && payload.name !== '..'
    && !/[/\\]/.test(payload.name),
  { message: 'host.createDirectory requires a single non-blank path segment name' },
) satisfies z.ZodType<Wire<RequestPayload<'host.createDirectory'>>>

/** host.createDirectory response value: the created directory's absolute path. */
export const hostCreateDirectoryValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.createDirectory'>>>

/** One file or directory row of host.listEntries. */
export const fsEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory', 'other']),
  hidden: z.boolean(),
  size: z.number().optional(),
}) satisfies z.ZodType<Wire<FsEntry>>

/** host.listEntries request payload: the directory to list (required). */
export const hostListEntriesRequestSchema = z.object({
  path: z.string().min(1),
  /** Workspace root for ignore matching; omitted → registry longest prefix or `path`. */
  root: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.listEntries'>>>

/** host.listEntries response value. */
export const hostListEntriesValueSchema = z.object({
  path: z.string(),
  entries: z.array(fsEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'host.listEntries'>>>

/** host.searchEntries request payload. */
export const hostSearchEntriesRequestSchema = z.object({
  root: z.string().min(1),
  query: z.string(),
  limit: z.number().int().positive().max(500).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.searchEntries'>>>

/** host.searchEntries response value. */
export const hostSearchEntriesValueSchema = z.object({
  path: z.string(),
  entries: z.array(fsEntrySchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.searchEntries'>>>

/** host.mkdir request payload: the directory to create. */
export const hostMkdirRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.mkdir'>>>

/** host.mkdir response value: the created directory's absolute path. */
export const hostMkdirValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.mkdir'>>>

/** host.rename request payload. */
export const hostRenameRequestSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.rename'>>>

/** host.rename response value: the destination path. */
export const hostRenameValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.rename'>>>

/** host.delete request payload. */
export const hostDeleteRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.delete'>>>

/** host.delete response value. */
export const hostDeleteValueSchema = z.object({
  deleted: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'host.delete'>>>

/** host.copy request payload. */
export const hostCopyRequestSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.copy'>>>

/** host.copy response value: the destination path. */
export const hostCopyValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.copy'>>>

/** host.writeText request payload: path required; absent content is an empty file. */
export const hostWriteTextRequestSchema = z.object({
  path: z.string().min(1),
  content: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.writeText'>>>

/** host.writeText response value: the written file's absolute path. */
export const hostWriteTextValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.writeText'>>>

/** host.readText request payload. */
export const hostReadTextRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.readText'>>>

/** host.readText response value: the absolute path and UTF-8 body. */
export const hostReadTextValueSchema = z.object({
  path: z.string(),
  content: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.readText'>>>

/** host.openPath request payload. */
export const hostOpenPathRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.openPath'>>>

/** host.openPath response value. */
export const hostOpenPathValueSchema = z.object({
  opened: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'host.openPath'>>>

/** host.revealPath request payload. */
export const hostRevealPathRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.revealPath'>>>

/** host.revealPath response value. */
export const hostRevealPathValueSchema = z.object({
  revealed: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'host.revealPath'>>>

/**
 * host.restartWeb request payload: optional port only. `.strict()` refuses
 * command/argv and any other extra key so the browser cannot smuggle shell.
 */
export const hostRestartWebRequestSchema = z.object({
  port: z.number().int().min(1).max(65535).optional(),
}).strict() satisfies z.ZodType<Wire<RequestPayload<'host.restartWeb'>>>

/** host.restartWeb response value. */
export const hostRestartWebValueSchema = z.object({
  accepted: z.literal(true),
  port: z.number().int().min(1).max(65535),
}) satisfies z.ZodType<Wire<ResponseValue<'host.restartWeb'>>>
