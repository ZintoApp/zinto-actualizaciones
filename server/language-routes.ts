import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { ensureSuperAdmin } from "./middleware";
import serverI18n from "./utils/server-i18n";
import multer from "multer";
import fs from "fs";
import path from "path";
import { z } from "zod";


const languageSchema = z.object({
  code: z.string().min(2).max(5),
  name: z.string().min(2).max(50),
  nativeName: z.string().min(2).max(50),
  flagIcon: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  direction: z.enum(["ltr", "rtl"]).optional()
});

const namespaceSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().optional()
});

const keySchema = z.object({
  namespaceId: z.number().int().positive(),
  key: z.string().min(1).max(100),
  description: z.string().optional()
});

const translationSchema = z.object({
  keyId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  value: z.string().min(1)
});


const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

async function invalidateServerI18nForLanguageId(languageId: number): Promise<void> {
  try {
    const lang = await storage.getLanguage(languageId);
    if (lang?.code) {
      serverI18n.invalidateLanguageCache(lang.code);
    }
  } catch {
    // ignore
  }
}

export function setupLanguageRoutes(app: Express) {



  app.get("/api/languages", async (req, res) => {
    try {
      const languages = await storage.getAllLanguages();
      res.json(languages);
    } catch (error) {
      console.error("Error fetching languages:", error);
      res.status(500).json({ error: "Failed to fetch languages" });
    }
  });


  app.get("/api/languages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const language = await storage.getLanguage(id);

      if (!language) {
        return res.status(404).json({ error: "Language not found" });
      }

      res.json(language);
    } catch (error) {
      console.error(`Error fetching language with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to fetch language" });
    }
  });


  app.get("/api/languages/code/:code", async (req, res) => {
    try {
      const language = await storage.getLanguageByCode(req.params.code);

      if (!language) {
        return res.status(404).json({ error: "Language not found" });
      }

      res.json(language);
    } catch (error) {
      console.error(`Error fetching language with code ${req.params.code}:`, error);
      res.status(500).json({ error: "Failed to fetch language" });
    }
  });


  app.get("/api/languages/default", async (req, res) => {
    try {
      const language = await storage.getDefaultLanguage();

      if (!language) {
        return res.status(404).json({ error: "Default language not found" });
      }

      res.json(language);
    } catch (error) {
      console.error("Error fetching default language:", error);
      res.status(500).json({ error: "Failed to fetch default language" });
    }
  });


  app.get("/api/admin/languages", ensureSuperAdmin, async (req, res) => {
    try {
      const languages = await storage.getAllLanguages();
      res.json(languages);
    } catch (error) {
      console.error("Error fetching languages:", error);
      res.status(500).json({ error: "Failed to fetch languages" });
    }
  });


  app.post("/api/admin/languages", ensureSuperAdmin, async (req, res) => {
    try {
      const validatedData = languageSchema.parse(req.body);
      const language = await storage.createLanguage(validatedData);
      res.status(201).json(language);
    } catch (error) {
      console.error("Error creating language:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create language" });
    }
  });


  app.put("/api/admin/languages/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = languageSchema.partial().parse(req.body);
      const language = await storage.updateLanguage(id, validatedData);
      res.json(language);
    } catch (error) {
      console.error(`Error updating language with ID ${req.params.id}:`, error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update language" });
    }
  });


  app.delete("/api/admin/languages/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteLanguage(id);

      if (!success) {
        return res.status(404).json({ error: "Language not found or could not be deleted" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error(`Error deleting language with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to delete language" });
    }
  });


  app.post("/api/admin/languages/:id/default", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.setDefaultLanguage(id);

      if (!success) {
        return res.status(404).json({ error: "Language not found or could not be set as default" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error(`Error setting language ${req.params.id} as default:`, error);
      res.status(500).json({ error: "Failed to set default language" });
    }
  });




  app.get("/api/namespaces", async (req, res) => {
    try {
      const namespaces = await storage.getAllNamespaces();
      res.json(namespaces);
    } catch (error) {
      console.error("Error fetching namespaces:", error);
      res.status(500).json({ error: "Failed to fetch namespaces" });
    }
  });


  app.get("/api/namespaces/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const namespace = await storage.getNamespace(id);

      if (!namespace) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      res.json(namespace);
    } catch (error) {
      console.error(`Error fetching namespace with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to fetch namespace" });
    }
  });


  app.post("/api/admin/namespaces", ensureSuperAdmin, async (req, res) => {
    try {
      const validatedData = namespaceSchema.parse(req.body);
      const namespace = await storage.createNamespace(validatedData);
      serverI18n.invalidateAllCatalogCaches();
      res.status(201).json(namespace);
    } catch (error) {
      console.error("Error creating namespace:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create namespace" });
    }
  });


  app.put("/api/admin/namespaces/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = namespaceSchema.partial().parse(req.body);
      const namespace = await storage.updateNamespace(id, validatedData);
      serverI18n.invalidateAllCatalogCaches();
      res.json(namespace);
    } catch (error) {
      console.error(`Error updating namespace with ID ${req.params.id}:`, error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update namespace" });
    }
  });


  app.delete("/api/admin/namespaces/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteNamespace(id);

      if (!success) {
        return res.status(404).json({ error: "Namespace not found or could not be deleted" });
      }

      serverI18n.invalidateAllCatalogCaches();
      res.json({ success: true });
    } catch (error) {
      console.error(`Error deleting namespace with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to delete namespace" });
    }
  });




  app.get("/api/keys", async (req, res) => {
    try {
      const namespaceId = req.query.namespaceId ? parseInt(req.query.namespaceId as string) : undefined;
      const keys = await storage.getAllKeys(namespaceId);
      res.json(keys);
    } catch (error) {
      console.error("Error fetching keys:", error);
      res.status(500).json({ error: "Failed to fetch keys" });
    }
  });


  app.get("/api/keys/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const key = await storage.getKey(id);

      if (!key) {
        return res.status(404).json({ error: "Key not found" });
      }

      res.json(key);
    } catch (error) {
      console.error(`Error fetching key with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to fetch key" });
    }
  });


  app.post("/api/admin/keys", ensureSuperAdmin, async (req, res) => {
    try {
      const validatedData = keySchema.parse(req.body);
      const key = await storage.createKey(validatedData);
      serverI18n.invalidateAllCatalogCaches();
      res.status(201).json(key);
    } catch (error) {
      console.error("Error creating key:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create key" });
    }
  });


  app.put("/api/admin/keys/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = keySchema.partial().parse(req.body);
      const key = await storage.updateKey(id, validatedData);
      serverI18n.invalidateAllCatalogCaches();
      res.json(key);
    } catch (error) {
      console.error(`Error updating key with ID ${req.params.id}:`, error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update key" });
    }
  });


  app.delete("/api/admin/keys/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteKey(id);

      if (!success) {
        return res.status(404).json({ error: "Key not found or could not be deleted" });
      }

      serverI18n.invalidateAllCatalogCaches();
      res.json({ success: true });
    } catch (error) {
      console.error(`Error deleting key with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to delete key" });
    }
  });




  app.get("/api/translations", async (req, res) => {
    try {
      const languageId = req.query.languageId ? parseInt(req.query.languageId as string) : undefined;
      const keyId = req.query.keyId ? parseInt(req.query.keyId as string) : undefined;
      const translations = await storage.getAllTranslations(languageId, keyId);
      res.json(translations);
    } catch (error) {
      console.error("Error fetching translations:", error);
      res.status(500).json({ error: "Failed to fetch translations" });
    }
  });


  app.get("/api/translations/id/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const translation = await storage.getTranslation(id);

      if (!translation) {
        return res.status(404).json({ error: "Translation not found" });
      }

      res.json(translation);
    } catch (error) {
      console.error(`Error fetching translation with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to fetch translation" });
    }
  });


  app.post("/api/admin/translations", ensureSuperAdmin, async (req, res) => {
    try {
      const validatedData = translationSchema.parse(req.body);
      const translation = await storage.createTranslation(validatedData);
      await invalidateServerI18nForLanguageId(translation.languageId);
      res.status(201).json(translation);
    } catch (error) {
      console.error("Error creating translation:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create translation" });
    }
  });


  app.put("/api/admin/translations/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = translationSchema.partial().parse(req.body);
      const existing = await storage.getTranslation(id);
      if (!existing) {
        return res.status(404).json({ error: "Translation not found" });
      }
      const translation = await storage.updateTranslation(id, validatedData);
      await invalidateServerI18nForLanguageId(existing.languageId);
      if (translation.languageId !== existing.languageId) {
        await invalidateServerI18nForLanguageId(translation.languageId);
      }
      res.json(translation);
    } catch (error) {
      console.error(`Error updating translation with ID ${req.params.id}:`, error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update translation" });
    }
  });


  app.delete("/api/admin/translations/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getTranslation(id);
      const success = await storage.deleteTranslation(id);

      if (!success) {
        return res.status(404).json({ error: "Translation not found or could not be deleted" });
      }

      if (existing) {
        await invalidateServerI18nForLanguageId(existing.languageId);
      }

      res.json({ success: true });
    } catch (error) {
      console.error(`Error deleting translation with ID ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to delete translation" });
    }
  });




  app.get("/api/translations/:code", async (req, res) => {
    try {
      const translations = await storage.getTranslationsForLanguage(req.params.code);
      res.json(translations);
    } catch (error) {
      console.error(`Error fetching translations for language ${req.params.code}:`, error);
      res.status(500).json({ error: "Failed to fetch translations" });
    }
  });


  app.get("/api/translations/language/:code", async (req, res) => {
    try {
      const translations = await storage.getTranslationsForLanguageByNamespace(req.params.code);
      res.json(translations);
    } catch (error) {
      console.error(`Error fetching organized translations for language ${req.params.code}:`, error);
      res.status(500).json({ error: "Failed to fetch translations" });
    }
  });


  app.post("/api/admin/translations/import/:languageId", ensureSuperAdmin, upload.single("file"), async (req, res) => {
    try {
      const languageId = parseInt(req.params.languageId);


      const language = await storage.getLanguage(languageId);
      if (!language) {
        return res.status(404).json({ error: "Language not found" });
      }


      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }


      const filePath = req.file.path;
      const fileContent = fs.readFileSync(filePath, "utf8");


      let rawData;
      try {
        rawData = JSON.parse(fileContent);
      } catch (error) {
        return res.status(400).json({ error: "Invalid JSON file" });
      }


      let translations;
      if (Array.isArray(rawData)) {

        translations = await storage.convertArrayToNestedFormat(rawData);
      } else {

        translations = rawData;
      }


      const success = await storage.importTranslations(languageId, translations);


      fs.unlinkSync(filePath);

      if (!success) {
        return res.status(500).json({ error: "Failed to import translations" });
      }

      await invalidateServerI18nForLanguageId(languageId);

      res.json({ success: true });
    } catch (error) {
      console.error(`Error importing translations for language ${req.params.languageId}:`, error);
      res.status(500).json({ error: "Failed to import translations" });
    }
  });


  app.get("/api/admin/translations/export/:languageCode", ensureSuperAdmin, async (req, res) => {
    try {
      const format = req.query.format as string || 'array';

      if (format === 'nested') {

        const translations = await storage.getTranslationsForLanguageByNamespace(req.params.languageCode);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=${req.params.languageCode}-translations-nested.json`);
        res.json(translations);
      } else {

        const translations = await storage.getTranslationsForLanguageAsArray(req.params.languageCode);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=${req.params.languageCode}-translations.json`);
        res.json(translations);
      }
    } catch (error) {
      console.error(`Error exporting translations for language ${req.params.languageCode}:`, error);
      res.status(500).json({ error: "Failed to export translations" });
    }
  });


  app.put("/api/user/language", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { languageCode } = req.body;

      if (!languageCode) {
        return res.status(400).json({ error: "Language code is required" });
      }


      const language = await storage.getLanguageByCode(languageCode);
      if (!language) {
        return res.status(404).json({ error: "Language not found" });
      }


      const user = await storage.updateUser(req.user.id, { languagePreference: languageCode });

      res.json({ success: true, user });
    } catch (error) {
      console.error("Error updating user language preference:", error);
      res.status(500).json({ error: "Failed to update language preference" });
    }
  });
}
