declare module 'original-fs' {
  export function readFileSync(path: string): Buffer
  export function writeFileSync(path: string, data: Buffer | string): void
  export function existsSync(path: string): boolean
  export function copyFileSync(src: string, dst: string): void
  export function cpSync(src: string, dst: string, opts?: { recursive?: boolean }): void
  export function readdirSync(path: string): string[]
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void
  export function statSync(path: string): { size: number }
}
