import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(8000),
  API_PREFIX: Joi.string().default('api/v1'),

  MONGODB_URI: Joi.string().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  /** `true` = journey step emails via BullMQ (needs Redis + worker). Otherwise direct SMTP. */
  SELL_USE_BULL_QUEUE: Joi.string().valid('true', 'false').optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  BCRYPT_ROUNDS: Joi.number().min(10).max(14).default(12),
  RESET_TOKEN_EXPIRES_IN: Joi.number().default(3600),

  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Email provider
  EMAIL_PROVIDER: Joi.string().valid('sendgrid', 'smtp').default('smtp'),
  SENDGRID_API_KEY: Joi.string().optional().allow(''),
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  SMTP_FROM_EMAIL: Joi.string().email().default('noreply@rekartmailer.io'),
  SMTP_FROM_NAME: Joi.string().optional().allow(''),
  SENDGRID_FROM_EMAIL: Joi.string().email().optional().allow(''),
  SENDGRID_FROM_NAME: Joi.string().optional().allow(''),
});
