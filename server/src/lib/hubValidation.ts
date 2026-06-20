/* ולידציה תכנותית של מבנה ה-Hub בקווסט עם מפתחות */

interface NavChoice {
  id: string
  text: string
  nextSceneId?: string | null
  requiredItemIds?: string[]
  unlockText?: string
}

interface SceneNode {
  id: string
  title: string
  collectableItem?: { id: string; name: string }
  choices?: NavChoice[]
  nextSceneId?: string | null
}

export interface HubInfo {
  hubSceneId: string
  hubTitle: string
  paths: { entryChoiceText: string; sceneTitles: string[]; keyId: string | null }[]
  lockedChoiceText: string
}

export interface HubValidationResult {
  ok: boolean
  errors: string[]
  hub?: HubInfo
}

function openChoicesOf(scene: SceneNode): NavChoice[] {
  return (scene.choices ?? []).filter((c) => !(c.requiredItemIds?.length ?? 0))
}

function lockedChoicesOf(scene: SceneNode): NavChoice[] {
  return (scene.choices ?? []).filter((c) => (c.requiredItemIds?.length ?? 0) > 0)
}

/* הליכה לאורך מסלול מסצנת פתיחה עד חזרה ל-Hub (או מבוי סתום) */
function walkPath(
  startId: string,
  hubId: string,
  sceneById: Map<string, SceneNode>,
): { sceneIds: string[]; keyIds: string[]; returnsToHub: boolean; hitsLockedChoice: boolean } {
  const sceneIds: string[] = []
  const keyIds: string[] = []
  let hitsLockedChoice = false
  let currentId: string | null | undefined = startId
  const seen = new Set<string>()

  while (currentId && currentId !== hubId && !seen.has(currentId) && sceneIds.length < 20) {
    seen.add(currentId)
    const scene = sceneById.get(currentId)
    if (!scene) break
    sceneIds.push(currentId)
    if (scene.collectableItem) keyIds.push(scene.collectableItem.id)
    if (lockedChoicesOf(scene).length > 0) hitsLockedChoice = true

    /* ממשיכים: nextSceneId, או הבחירה הלא-נעולה הראשונה */
    if (scene.nextSceneId) {
      currentId = scene.nextSceneId
    } else if (scene.choices?.length) {
      const open = openChoicesOf(scene)[0]
      currentId = open?.nextSceneId ?? null
    } else {
      currentId = null
    }
  }

  return { sceneIds, keyIds, returnsToHub: currentId === hubId, hitsLockedChoice }
}

/**
 * בדיקת מבנה Hub:
 * - Hub עם N+1 בחירות פתוחות (N מסלולי מפתח + מעבר לסצנת המכשול)
 * - השער הנעול יושב בסצנת מכשול ייעודית — לעולם לא על ה-Hub
 * - כל מסלול מעניק מפתח ייחודי וחוזר ל-Hub
 * - בחירה נעולה אחת דורשת את כל המפתחות
 */
export function validateHubStructure(
  gameData: { scenes: SceneNode[]; entrySceneId: string },
  expectedKeys: number,
): HubValidationResult {
  const errors: string[] = []
  const sceneById = new Map(gameData.scenes.map((s) => [s.id, s]))

  const allKeyIds = gameData.scenes
    .filter((s) => s.collectableItem)
    .map((s) => s.collectableItem!.id)

  /* סצנות עם בחירות נעולות */
  const lockedScenes = gameData.scenes.filter((s) => lockedChoicesOf(s).length > 0)
  if (lockedScenes.length === 0) {
    errors.push(
      'לא נמצאה בחירת ניווט נעולה עם requiredItemIds — חובה סצנת מכשול עם שער נעול',
    )
    return { ok: false, errors }
  }

  /* איסור: בחירה נעולה על סצנה עם 2+ בחירות פתוחות (כלומר על Hub) */
  for (const s of lockedScenes) {
    if (openChoicesOf(s).length >= 2) {
      errors.push(
        `הבחירה הנעולה "${lockedChoicesOf(s)[0].text}" יושבת על סצנת ה-Hub ("${s.title}") — העבר אותה לסצנת מכשול ייעודית ונפרדת, שאליה מובילה בחירה פתוחה מה-Hub`,
      )
    }
  }

  /* הבחירה הנעולה שדורשת את כל המפתחות */
  const allLockedChoices = lockedScenes.flatMap((s) =>
    lockedChoicesOf(s).map((c) => ({ scene: s, choice: c })),
  )
  const exit = allLockedChoices.find(({ choice }) => {
    const req = new Set(choice.requiredItemIds)
    return allKeyIds.every((k) => req.has(k))
  })
  if (!exit) {
    errors.push(
      `אין בחירת יציאה הנעולה בכל ${expectedKeys} המפתחות (${allKeyIds.join(', ')})`,
    )
  }

  /* איתור ה-Hub: הסצנה עם הכי הרבה בחירות פתוחות (לפחות 2) */
  const hubCandidates = gameData.scenes
    .filter((s) => openChoicesOf(s).length >= 2 && lockedChoicesOf(s).length === 0)
    .sort((a, b) => openChoicesOf(b).length - openChoicesOf(a).length)

  const hub = hubCandidates[0]
  if (!hub) {
    errors.push(
      `לא נמצאה סצנת Hub: נדרשת סצנה עם ${expectedKeys + 1} בחירות פתוחות (${expectedKeys} מסלולים + מעבר לסצנת המכשול) ובלי בחירות נעולות`,
    )
    return { ok: false, errors }
  }

  const openChoices = openChoicesOf(hub)
  if (openChoices.length < expectedKeys + 1) {
    errors.push(
      `ב-Hub ("${hub.title}") יש רק ${openChoices.length} בחירות פתוחות במקום ${expectedKeys + 1} (${expectedKeys} מסלולי מפתח + מעבר לסצנת המכשול)`,
    )
  }

  /* הליכה בכל מסלול פתוח מה-Hub */
  const paths: HubInfo['paths'] = []
  const keysFound = new Map<string, string>() /* keyId → choice text */
  let gatePathFound = false

  for (const choice of openChoices) {
    if (!choice.nextSceneId) {
      errors.push(`הבחירה "${choice.text}" ב-Hub לא מובילה לאף סצנה (חסר nextSceneId)`)
      continue
    }
    const walk = walkPath(choice.nextSceneId, hub.id, sceneById)
    const titles = walk.sceneIds.map((id) => sceneById.get(id)?.title ?? id)

    if (walk.hitsLockedChoice) {
      /* זהו המסלול אל סצנת המכשול — לא מסלול מפתח */
      gatePathFound = true
      paths.push({ entryChoiceText: choice.text, sceneTitles: titles, keyId: null })
      continue
    }

    if (walk.keyIds.length === 0) {
      errors.push(`המסלול "${choice.text}" (${titles.join(' ← ')}) לא מעניק אף מפתח`)
    }
    for (const keyId of walk.keyIds) {
      if (keysFound.has(keyId)) {
        errors.push(
          `המפתח "${keyId}" מוענק גם במסלול "${keysFound.get(keyId)}" וגם במסלול "${choice.text}" — כל מפתח חייב מסלול משלו`,
        )
      } else {
        keysFound.set(keyId, choice.text)
      }
    }
    if (!walk.returnsToHub) {
      errors.push(`המסלול "${choice.text}" לא חוזר אל ה-Hub בסופו`)
    }

    paths.push({
      entryChoiceText: choice.text,
      sceneTitles: titles,
      keyId: walk.keyIds[0] ?? null,
    })
  }

  if (!gatePathFound && exit) {
    errors.push(
      `סצנת המכשול ("${exit.scene.title}") אינה נגישה בבחירה פתוחה ישירות מה-Hub — הוסף ב-Hub בחירה שמובילה אליה`,
    )
  }

  /* בדיקה: כל מפתח מושג ממסלול ישיר מה-Hub */
  for (const keyId of allKeyIds) {
    if (!keysFound.has(keyId)) {
      errors.push(
        `המפתח "${keyId}" לא נגיש ישירות מה-Hub — ייתכן שהוא נמצא במסלול שנגיש רק דרך מסלול אחר. חבר אותו ישירות ל-Hub`,
      )
    }
  }

  const hubInfo: HubInfo = {
    hubSceneId: hub.id,
    hubTitle: hub.title,
    paths,
    lockedChoiceText: exit?.choice.text ?? '',
  }

  return { ok: errors.length === 0, errors, hub: hubInfo }
}
