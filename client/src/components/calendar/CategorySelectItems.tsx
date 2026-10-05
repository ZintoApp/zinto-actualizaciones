import { SelectItem } from "@/components/ui/select";
import { useTranslation } from "@/hooks/use-translation";

export const getColorCategoryMap = (t: (key: string, fallback?: string) => string) => ({
  "1": { name: t("calendar.category.work", "Work"), color: "bg-blue-500" },
  "2": { name: t("calendar.category.personal", "Personal"), color: "bg-green-500" },
  "3": { name: t("calendar.category.family", "Family"), color: "bg-red-500" },
  "4": { name: t("calendar.category.health", "Health"), color: "bg-purple-500" },
  "5": { name: t("calendar.category.projects", "Projects"), color: "bg-amber-500" },
  "default": { name: t("calendar.category.default", "Default"), color: "bg-slate-500" }
});


export const COLOR_CATEGORY_MAP: Record<string, {name: string, color: string}> = {
  "1": { name: "Work", color: "bg-blue-500" },
  "2": { name: "Personal", color: "bg-green-500" },
  "3": { name: "Family", color: "bg-red-500" },
  "4": { name: "Health", color: "bg-purple-500" },
  "5": { name: "Projects", color: "bg-amber-500" },
  "default": { name: "Default", color: "bg-slate-500" }
};

export function CategorySelectItems() {
  const { t } = useTranslation();
  const colorCategoryMap = getColorCategoryMap(t);

  return (
    <>
      {Object.entries(colorCategoryMap).map(([id, category]) => (
        id !== 'default' && (
          <SelectItem key={id} value={id}>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full ${category.color} mr-2`}></div>
              <span>{category.name}</span>
            </div>
          </SelectItem>
        )
      ))}
    </>
  );
}