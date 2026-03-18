import { chatModalStyles } from "./chatModalStyles";
import { chatThreadStyles } from "./chatThreadStyles";

export const chatStyles = {
  ...chatThreadStyles,
  ...chatModalStyles,
} as const;
