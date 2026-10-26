-- rollback ל-quest_thumbs.sql. מוחק את עמודות התמונה הממוזערת (הקבצים ב-Cloudinary נשארים; אפשר ליצור מחדש בכל רגע).
ALTER TABLE quests DROP COLUMN IF EXISTS thumb_url;
ALTER TABLE quests DROP COLUMN IF EXISTS thumb_src;
