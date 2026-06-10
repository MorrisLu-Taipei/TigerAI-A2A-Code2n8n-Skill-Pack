import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

export const cache = {
  get: async (key: string) => {
    await connectRedis();
    return await redisClient.get(key);
  },
  set: async (key: string, value: string, ttlSeconds?: number) => {
    await connectRedis();
    if (ttlSeconds) {
      await redisClient.set(key, value, { EX: ttlSeconds });
    } else {
      await redisClient.set(key, value);
    }
  },
  exists: async (key: string) => {
    await connectRedis();
    return await redisClient.exists(key);
  },
  delete: async (key: string) => {
    await connectRedis();
    await redisClient.del(key);
  }
};
