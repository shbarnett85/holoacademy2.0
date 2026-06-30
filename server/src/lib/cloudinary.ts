import { v2 as cloudinary } from 'cloudinary'

/* קליינט Cloudinary — אחסון תמונות ההדמיות */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/* העלאת תמונת base64 — מחזירה secure_url */
export async function uploadBase64Image(
  b64: string,
  folder: string,
  publicId: string,
): Promise<string> {
  const result = await cloudinary.uploader.upload(`data:image/png;base64,${b64}`, {
    folder,
    public_id: publicId,
    overwrite: true,
    invalidate: true, /* מנקה CDN cache ל-public_id חוזר (יצירה-מחדש) — שלא יוגש העתק ישן */
    resource_type: 'image',
  })
  return result.secure_url
}
