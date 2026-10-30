import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '../../skills/paksh-advocate');

let loaded = null;

export function loadSkill(baseDir = SKILL_DIR) {
  if (loaded && loaded.baseDir === baseDir) {
    return loaded;
  }

  try {
    const configPath = path.join(baseDir, 'config/paksh.config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Paksh config not found at ${configPath}`);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const prompts = {
      system: fs.readFileSync(path.join(baseDir, 'prompts/system.md'), 'utf-8'),
      opening: fs.readFileSync(path.join(baseDir, 'prompts/opening.md'), 'utf-8'),
      case_opening: fs.readFileSync(path.join(baseDir, 'prompts/case-opening.md'), 'utf-8'),
      research_plan: fs.readFileSync(path.join(baseDir, 'prompts/research-plan.md'), 'utf-8'),
      clarify: fs.readFileSync(path.join(baseDir, 'prompts/clarify.md'), 'utf-8'),
      rebuttal: fs.readFileSync(path.join(baseDir, 'prompts/rebuttal.md'), 'utf-8'),
    };

    const schemas = {
      'case-input': JSON.parse(fs.readFileSync(path.join(baseDir, 'schemas/case-input.schema.json'), 'utf-8')),
      'evidence-ledger': JSON.parse(fs.readFileSync(path.join(baseDir, 'schemas/evidence-ledger.schema.json'), 'utf-8')),
      'paksh-opening': JSON.parse(fs.readFileSync(path.join(baseDir, 'schemas/paksh-opening.schema.json'), 'utf-8')),
      'case-opening': JSON.parse(fs.readFileSync(path.join(baseDir, 'schemas/case-opening.schema.json'), 'utf-8')),
      'paksh-clarify': JSON.parse(fs.readFileSync(path.join(baseDir, 'schemas/paksh-clarify.schema.json'), 'utf-8')),
      'paksh-rebuttal': JSON.parse(fs.readFileSync(path.join(baseDir, 'schemas/paksh-rebuttal.schema.json'), 'utf-8')),
      'paksh-research-plan': JSON.parse(fs.readFileSync(path.join(baseDir, 'schemas/paksh-research-plan.schema.json'), 'utf-8')),
    };

    loaded = {
      baseDir,
      version: config.version,
      config,
      prompts,
      schemas,
    };
    return loaded;
  } catch (err) {
    throw new Error(`Failed to load Paksh skill from ${baseDir}: ${err.message}`);
  }
}

export function getSkill() {
  if (!loaded) {
    return loadSkill();
  }
  return loaded;
}
