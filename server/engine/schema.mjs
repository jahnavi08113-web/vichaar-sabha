/**
 * Small subset of JSON Schema 2020-12 used by the Paksh skill.
 * Matches scripts/validate_paksh.py check_schema.
 */

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function checkSchema(value, schema, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;

  if ('const' in schema && value !== schema.const) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }

  if ('enum' in schema && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  }

  const t = schema.type;
  if (t) {
    let matches = false;
    if (t === 'object') matches = isPlainObject(value);
    else if (t === 'array') matches = Array.isArray(value);
    else if (t === 'string') matches = typeof value === 'string';
    else if (t === 'boolean') matches = typeof value === 'boolean';
    else if (t === 'integer') matches = typeof value === 'number' && Number.isInteger(value);
    else if (t === 'number') matches = typeof value === 'number' && !Number.isNaN(value);

    if (!matches) {
      errors.push(`${path}: expected ${t}`);
      return errors;
    }
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    if ('minimum' in schema && value < schema.minimum) {
      errors.push(`${path}: less than minimum ${schema.minimum}`);
    }
  }

  if (typeof value === 'string') {
    if ('minLength' in schema && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength} chars`);
    }
    if ('maxLength' in schema && value.length > schema.maxLength) {
      errors.push(`${path}: longer than ${schema.maxLength} chars (${value.length})`);
    }
    if ('pattern' in schema) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
      }
    }
  }

  if (Array.isArray(value)) {
    if ('minItems' in schema && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} items`);
    }
    if ('maxItems' in schema && value.length > schema.maxItems) {
      errors.push(`${path}: at most ${schema.maxItems} items (${value.length})`);
    }
    if ('items' in schema) {
      for (let i = 0; i < value.length; i++) {
        checkSchema(value[i], schema.items, `${path}[${i}]`, errors);
      }
    }
  }

  if (isPlainObject(value)) {
    const props = schema.properties || {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${path}: missing required '${key}'`);
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) {
          errors.push(`${path}: unexpected property '${key}'`);
        }
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) {
        checkSchema(value[key], sub, `${path}.${key}`, errors);
      }
    }
  }

  return errors;
}

export function validateSchema(schema, value) {
  const errors = [];
  checkSchema(value, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}
