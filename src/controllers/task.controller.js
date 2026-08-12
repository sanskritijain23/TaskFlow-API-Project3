'use strict';

const taskModel = require('../models/task.model');

function createNotFoundError() {
  const error = new Error('Task not found');
  error.statusCode = 404;
  return error;
}

function getAllTasks(req, res, next) {
  try {
    const { tasks, pagination } = taskModel.getTasks(req.query);
    res.status(200).json({ success: true, data: tasks, pagination });
  } catch (error) {
    next(error);
  }
}

function getTaskById(req, res, next) {
  try {
    const task = taskModel.getTaskById(req.params.id);

    if (!task) {
      return next(createNotFoundError());
    }

    return res.status(200).json({ success: true, data: task });
  } catch (error) {
    return next(error);
  }
}

function createTask(req, res, next) {
  try {
    const createdTask = taskModel.createTask(req.body);
    res.status(201).json({ success: true, data: createdTask });
  } catch (error) {
    next(error);
  }
}

function replaceTask(req, res, next) {
  try {
    const updatedTask = taskModel.replaceTask(req.params.id, req.body);

    if (!updatedTask) {
      return next(createNotFoundError());
    }

    return res.status(200).json({ success: true, data: updatedTask });
  } catch (error) {
    return next(error);
  }
}

function patchTask(req, res, next) {
  try {
    const updatedTask = taskModel.patchTask(req.params.id, req.body);

    if (!updatedTask) {
      return next(createNotFoundError());
    }

    return res.status(200).json({ success: true, data: updatedTask });
  } catch (error) {
    return next(error);
  }
}

function deleteTask(req, res, next) {
  try {
    const deleted = taskModel.deleteTask(req.params.id);

    if (!deleted) {
      return next(createNotFoundError());
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  replaceTask,
  patchTask,
  deleteTask,
};
