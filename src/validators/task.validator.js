'use strict';

const Joi = require('joi');

const STATUS_VALUES = ['pending', 'in_progress', 'completed'];
const PRIORITY_VALUES = ['low', 'medium', 'high'];
const SORTABLE_COLUMNS = ['id', 'title', 'status', 'priority', 'due_date', 'created_at', 'updated_at'];
const ORDER_VALUES = ['asc', 'desc'];

const titleSchema = Joi.string().trim().min(1).max(255).required().messages({
  'string.empty': 'title is required and cannot be empty or whitespace-only',
  'string.min': 'title is required and cannot be empty or whitespace-only',
});

const optionalTitleSchema = Joi.string().trim().min(1).max(255).messages({
  'string.empty': 'title cannot be empty or whitespace-only',
  'string.min': 'title cannot be empty or whitespace-only',
});

const descriptionSchema = Joi.string().allow('', null).max(2000);
const statusSchema = Joi.string().valid(...STATUS_VALUES);
const prioritySchema = Joi.string().valid(...PRIORITY_VALUES);
const completedSchema = Joi.boolean();
const dueDateSchema = Joi.date().iso().allow(null).messages({
  'date.format': 'due_date must be a valid ISO 8601 date, or null',
});

// POST /api/v1/tasks - all fields other than title are optional; defaults are
// applied later in the model layer so that "not provided" can be
// distinguished from "provided as the default value".
const createTaskSchema = Joi.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  due_date: dueDateSchema.optional(),
  completed: completedSchema.optional(),
})
  .unknown(false)
  .messages({ 'object.unknown': '{{#label}} is not a recognized field' });

// PUT /api/v1/tasks/:id - a full replacement, so every editable field is
// mandatory. Fields not sent are not carried over from the existing row.
const replaceTaskSchema = Joi.object({
  title: titleSchema,
  description: descriptionSchema.allow(null).required(),
  status: statusSchema.required(),
  priority: prioritySchema.required(),
  due_date: dueDateSchema.required(),
  completed: completedSchema.required(),
})
  .unknown(false)
  .messages({ 'object.unknown': '{{#label}} is not a recognized field' });

// PATCH /api/v1/tasks/:id - any subset of editable fields, but at least one
// is required so empty update bodies are rejected.
const patchTaskSchema = Joi.object({
  title: optionalTitleSchema,
  description: descriptionSchema,
  status: statusSchema,
  priority: prioritySchema,
  due_date: dueDateSchema,
  completed: completedSchema,
})
  .min(1)
  .unknown(false)
  .messages({
    'object.min': 'request body must include at least one field to update',
    'object.unknown': '{{#label}} is not a recognized field',
  });

const taskIdSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'id must be a positive integer',
    'number.integer': 'id must be a positive integer',
    'number.positive': 'id must be a positive integer',
  }),
}).unknown(false);

const taskListQuerySchema = Joi.object({
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  completed: Joi.boolean().optional(),
  page: Joi.number().integer().positive().default(1).messages({
    'number.base': 'page must be a positive integer',
    'number.integer': 'page must be a positive integer',
    'number.positive': 'page must be a positive integer',
  }),
  limit: Joi.number().integer().positive().max(100).default(10).messages({
    'number.base': 'limit must be a positive integer (max 100)',
    'number.integer': 'limit must be a positive integer (max 100)',
    'number.positive': 'limit must be a positive integer (max 100)',
    'number.max': 'limit must be a positive integer (max 100)',
  }),
  sortBy: Joi.string()
    .valid(...SORTABLE_COLUMNS)
    .default('created_at')
    .messages({ 'any.only': `sortBy must be one of: ${SORTABLE_COLUMNS.join(', ')}` }),
  order: Joi.string()
    .valid(...ORDER_VALUES)
    .default('desc')
    .messages({ 'any.only': `order must be one of: ${ORDER_VALUES.join(', ')}` }),
})
  .unknown(false)
  .messages({ 'object.unknown': '{{#label}} is not a recognized query parameter' });

module.exports = {
  STATUS_VALUES,
  PRIORITY_VALUES,
  SORTABLE_COLUMNS,
  ORDER_VALUES,
  createTaskSchema,
  replaceTaskSchema,
  patchTaskSchema,
  taskIdSchema,
  taskListQuerySchema,
};
