import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
const ORIGIN = 'http://localhost:4180'
const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const setAnn = (obj) => page.evaluate((o) => localStorage.setItem('annotations.v1', JSON.stringify(o)), obj)
const getAnn = () => page.evaluate(() => JSON.parse(localStorage.getItem('annotations.v1') || '{}'))

// seed one annotation, reload so React reads it
await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
await setAnn({ 'psalms.27.1': { note: 'hi', highlights: [{ id: 'x', lang: 'ja', start: 0, end: 3, color: 'yellow' }] } })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.verse')

// EXPORT — click Export in settings, capture the download, inspect the JSON
await page.locator('.tools .icon[title="Settings"]').click()
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.mini', { hasText: 'Export' }).click()])
const path = '/tmp/exported-notes.json'
await dl.saveAs(path)
const payload = JSON.parse(readFileSync(path, 'utf8'))
log(`EXPORT   filename="${dl.suggestedFilename()}" type=${payload.type} hasData=${!!payload.data['psalms.27.1']} note="${payload.data['psalms.27.1']?.note}"`)

// IMPORT — write a second file with a NEW verse, import it, confirm merge
const importFile = '/tmp/import-notes.json'
writeFileSync(importFile, JSON.stringify({ type: 'annotations', version: 1, data: { 'john.3.16': { note: 'love' } } }))
await page.locator('.mini.asbtn input[type=file]').setInputFiles(importFile)
await page.waitForTimeout(200)
const after = await getAnn()
log(`IMPORT   kept_psalms=${!!after['psalms.27.1']} added_john=${!!after['john.3.16']} johnNote="${after['john.3.16']?.note}"`)

// also confirm a raw store (no wrapper) imports
const rawFile = '/tmp/import-raw.json'
writeFileSync(rawFile, JSON.stringify({ 'romans.8.28': { note: 'raw' } }))
await page.locator('.mini.asbtn input[type=file]').setInputFiles(rawFile)
await page.waitForTimeout(200)
const after2 = await getAnn()
log(`IMPORT2  rawFormatAccepted=${!!after2['romans.8.28']}`)

await browser.close()
