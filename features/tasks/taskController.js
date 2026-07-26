import * as taskService from "./taskService.js";

export async function getTasks(req, res) {
  const tasks = await taskService.getTasks();
  res.json(tasks);
}

export async function createTask(req, res) {
  const { text } = req.body;
  await taskService.createTask(text);
  res.json({ success: true });
}

export async function updateTask(req, res) {
  await taskService.updateTask(req.params.id);
  res.json({ success: true });
}

export async function deleteTask(req, res) {
  await taskService.deleteTask(req.params.id);
  res.json({ success: true });
}
