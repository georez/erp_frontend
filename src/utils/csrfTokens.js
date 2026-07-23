import Tokens from "csrf";

export const tokens = new Tokens();
export const secret = process.env.CSRF_SECRET;
