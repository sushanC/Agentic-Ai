import * as noteService from "./noteService.js";

export async function getNotes(req, res) {
  const notes = await noteService.getNotes();
  res.json(notes);
}

export async function createNote(req, res) {
  const { content } = req.body;
  await noteService.createNote(content);
  res.json({ success: true });
}

export async function updateNote(req, res) {
  const { content } = req.body;
  await noteService.updateNote(req.params.id, content);
  res.json({ success: true });
}

export async function deleteNote(req, res) {
  await noteService.deleteNote(req.params.id);
  res.json({ success: true });
}
