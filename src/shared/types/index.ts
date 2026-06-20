/* ── טיפוסים מרכזיים התואמים ל-schema של Supabase ── */

export interface School {
  id: string
  name: string
  created_at: string
}

export type UserRole = 'student' | 'teacher' | 'admin'

export interface User {
  id: string
  school_id: string
  name: string
  role: UserRole
  pin_hash?: string
  created_at: string
}

export interface Class {
  id: string
  school_id: string
  teacher_id: string
  name: string
  url_code: string       // קוד ייחודי לכניסת תלמידים
  created_at: string
}

/* ── מבנה משחק ── */

export interface Choice {
  id: string
  text: string
  is_correct: boolean
  next_scene_id?: string
}

export interface Item {
  id: string
  type: 'text' | 'image' | 'audio' | 'video' | '3d'
  src?: string
  content?: string
  position?: { x: number; y: number; z: number }
}

export interface Scene {
  id: string
  title: string
  items: Item[]
  choices?: Choice[]
  next_scene_id?: string
}

export interface GameData {
  scenes: Scene[]
  entry_scene_id: string
}

export interface Quest {
  id: string
  class_id: string
  creator_id: string
  title: string
  description?: string
  game_data: GameData
  is_published: boolean
  created_at: string
  updated_at: string
}

/* ── סשן משחק וניתוח נתונים ── */

export interface Session {
  id: string
  quest_id: string
  student_id: string
  started_at: string
  completed_at?: string
  score?: number
}

export interface GameEvent {
  id: string
  session_id: string
  scene_id: string
  choice_id?: string
  timestamp: string
  extra?: Record<string, unknown>
}

export interface DifficultyProfile {
  student_id: string
  quest_id: string
  attempts: number
  avg_score: number
  last_played: string
  weak_scenes: string[]
}
