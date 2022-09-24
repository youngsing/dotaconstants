export {}

declare global {
  // interface JsonObject {
  //   // deno-lint-ignore no-explicit-any
  //   [key: string]: any
  // }
  // deno-lint-ignore no-explicit-any
  type JsonObject = Record<string, any>
  type Optional<T> = T | null | undefined | void
}
