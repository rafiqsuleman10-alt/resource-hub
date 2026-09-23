// Categories in the order the chips appear on the Browse screen.
export const CATEGORIES = ["Lab & safety", "Measuring", "Tech", "Camera & AV", "Everyday", "Health & access"] as const;

export type NodeInfo = {
  id: string;
  name: string;
  place: string;
  position: number;
  battery_backup_ok: boolean;
  online: boolean;
};

/** "S-Blocks, ground floor" -> "S-Blocks" */
export const shortPlace = (place: string) => place.split(",")[0];
