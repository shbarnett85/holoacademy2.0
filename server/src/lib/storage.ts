import { supabaseAdmin } from './supabase.js'

const BUCKET = 'quest-images'

/* יצירת ה-bucket אם לא קיים (idempotent) */
async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
  }
}

let bucketReady = false

export async function uploadBase64Image(b64: string, folder: string, publicId: string): Promise<string> {
  if (!bucketReady) {
    await ensureBucket()
    bucketReady = true
  }

  const buffer = Buffer.from(b64, 'base64')
  const path = `${folder}/${publicId}.png`

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: true })

  if (error) throw new Error(`Supabase Storage: ${error.message}`)

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
