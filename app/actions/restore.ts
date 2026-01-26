'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { join } from "path"
import { writeFile, mkdir } from "fs/promises"
import { gunzip } from "zlib"
import { promisify } from "util"

const gunzipAsync = promisify(gunzip)

type RestoreStats = {
    created: number
    updated: number
    skipped: number
    errors: number
}

type RestoreReport = {
    [key: string]: RestoreStats
}

export async function restoreSystemData(formData: FormData) {
    // 1. Auth Check
    const session = await auth()
    const user = session?.user as any
    if (!user || user.role !== 'ADMIN') {
        return { error: "Unauthorized" }
    }

    const file = formData.get('file') as File
    const overwrite = formData.get('overwrite') === 'true'

    if (!file) return { error: "No file provided" }

    try {
        // 2. Read & Decompress
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Check if Gzipped (Magic numbers 1f 8b) or fallback to plain JSON
        let jsonString: string
        if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
            const decompressed = await gunzipAsync(buffer)
            jsonString = decompressed.toString('utf-8')
        } else {
            jsonString = buffer.toString('utf-8')
        }

        const backup = JSON.parse(jsonString)
        const { data } = backup
        if (!data) return { error: "Invalid backup format: Missing data field" }

        // 3. Initialize Report
        const report: RestoreReport = {
            organizations: { created: 0, updated: 0, skipped: 0, errors: 0 },
            groups: { created: 0, updated: 0, skipped: 0, errors: 0 },
            profiles: { created: 0, updated: 0, skipped: 0, errors: 0 },
            users: { created: 0, updated: 0, skipped: 0, errors: 0 },
            prompts: { created: 0, updated: 0, skipped: 0, errors: 0 },
            entries: { created: 0, updated: 0, skipped: 0, errors: 0 },
            categories: { created: 0, updated: 0, skipped: 0, errors: 0 },
            avatars: { created: 0, updated: 0, skipped: 0, errors: 0 },
            rules: { created: 0, updated: 0, skipped: 0, errors: 0 },
        }

        // Helper for Restoration
        const restoreEntity = async (model: string, items: any[], reportKey: string, primaryKey = 'id') => {
            if (!items) return

            for (const item of items) {
                try {
                    // Extract Base64 if present (and write to disk) before saving DB record
                    if (item.base64Data && (item.logoUrl || item.url)) {
                        await restoreBinary(item)
                    }
                    // Clean up non-DB fields
                    const { base64Data, ...dbItem } = item

                    const cleanItem: any = {}
                    for (const key in dbItem) {
                        const val = dbItem[key]
                        if (val === null || typeof val !== 'object' || key === 'createdAt' || key === 'updatedAt') {
                            cleanItem[key] = val
                        }
                    }

                    if (model === 'user') {
                        if (item.profiles && Array.isArray(item.profiles)) {
                            cleanItem.profiles = { connect: item.profiles.map((p: any) => ({ id: p.id })) }
                        }
                        if (item.groups && Array.isArray(item.groups)) {
                            cleanItem.groups = { connect: item.groups.map((g: any) => ({ id: g.id })) }
                        }
                    }

                    // Check existence
                    // @ts-ignore
                    const existing = await prisma[model].findUnique({ where: { [primaryKey]: cleanItem[primaryKey] } })

                    if (existing) {
                        if (overwrite) {
                            // @ts-ignore
                            await prisma[model].update({
                                where: { [primaryKey]: cleanItem[primaryKey] },
                                data: cleanItem
                            })
                            report[reportKey].updated++
                        } else {
                            report[reportKey].skipped++
                        }
                    } else {
                        // @ts-ignore
                        await prisma[model].create({ data: cleanItem })
                        report[reportKey].created++
                    }
                } catch (e) {
                    console.error(`Failed to restore ${model} ${item.id}:`, e)
                    report[reportKey].errors++
                }
            }
        }

        // 4. Restore Sequence (Dependency Order)
        await restoreEntity('organization', data.organizations, 'organizations')
        await restoreEntity('userGroup', data.groups, 'groups')
        await restoreEntity('profile', data.profiles, 'profiles')
        await restoreEntity('promptCategory', data.categories, 'categories')
        await restoreEntity('prompt', data.prompts, 'prompts')
        await restoreEntity('user', data.users, 'users')
        await restoreEntity('userAvatar', data.avatars, 'avatars')
        await restoreEntity('profileRule', data.rules, 'rules')
        await restoreEntity('journalEntry', data.entries, 'entries')

        return { success: true, report }

    } catch (e) {
        console.error("Restore failed:", e)
        return { error: `Restore failed: ${(e as Error).message}` }
    }
}

async function restoreBinary(item: any) {
    try {
        const path = item.logoUrl || item.url // Org or Avatar field
        if (!path) return

        // matches "data:image/png;base64,..."
        const matches = item.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
        if (!matches || matches.length !== 3) return

        const buffer = Buffer.from(matches[2], 'base64')
        const fullPath = join(process.cwd(), 'public', path)

        // Ensure dir
        const { dirname } = require('path')
        await mkdir(dirname(fullPath), { recursive: true })

        await writeFile(fullPath, buffer)
    } catch (e) {
        console.warn("Failed to write binary file:", e)
    }
}
