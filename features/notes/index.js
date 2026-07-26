export { default as noteRoutes } from "./noteRoutes.js";
export { loadNotes, saveNotes } from "./noteStorage.js";
export { searchNotes } from "./noteSearch.js";
export {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  askNotes,
  handleNotes
} from "./noteService.js";
export * as noteService from "./noteService.js";
export * as noteController from "./noteController.js";
