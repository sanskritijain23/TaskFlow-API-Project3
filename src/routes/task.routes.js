'use strict';

const express = require('express');
const taskController = require('../controllers/task.controller');
const validate = require('../middleware/validation');
const {
  createTaskSchema,
  replaceTaskSchema,
  patchTaskSchema,
  taskIdSchema,
  taskListQuerySchema,
} = require('../validators/task.validator');

const router = express.Router();

router.get('/', validate(taskListQuerySchema, 'query'), taskController.getAllTasks);

router.get('/:id', validate(taskIdSchema, 'params'), taskController.getTaskById);

router.post('/', validate(createTaskSchema), taskController.createTask);

router.put(
  '/:id',
  validate(taskIdSchema, 'params'),
  validate(replaceTaskSchema),
  taskController.replaceTask
);

router.patch(
  '/:id',
  validate(taskIdSchema, 'params'),
  validate(patchTaskSchema),
  taskController.patchTask
);

router.delete('/:id', validate(taskIdSchema, 'params'), taskController.deleteTask);

module.exports = router;
