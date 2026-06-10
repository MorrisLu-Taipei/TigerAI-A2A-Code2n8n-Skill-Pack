import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'postgres',
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export async function getSettings() {
  const result = await query('SELECT * FROM public.app_settings ORDER BY updated_at DESC LIMIT 1');
  return result.rows[0];
};

export const updateSettings = async (settings: any) => {
  // Use a predictable ID for the singleton settings row (1)
  const singletonId = '00000000-0000-0000-0000-000000000001';
  
  const fields = Object.keys(settings).filter(f => 
    !['id', 'created_at', 'updated_at'].includes(f)
  );
  
  const values = fields.map(f => settings[f]);
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

  const sql = `
    INSERT INTO public.app_settings (id, ${fields.join(', ')}, updated_at)
    VALUES ('${singletonId}', ${placeholders}, NOW())
    ON CONFLICT (id) 
    DO UPDATE SET ${updateSet}, updated_at = NOW()
    RETURNING *;
  `;
  
  await query(sql, values);
};

