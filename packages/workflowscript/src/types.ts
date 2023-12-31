/* eslint-disable @typescript-eslint/no-explicit-any */
export type SourceCode = {
  /** The code being parsed or compiled */
  input?: string
  /** A reference to the file being parsed or compiled */
  filename?: string
}

/**
 * Type of ECMAScript constructors that can construct `T`s with argument
 * signature `A`.
 */
export interface Constructor<T = object, A extends unknown[] = any[]> {
  new (...args: A): T
}

/**
 * Type of ES2015 `class`es.
 */
export type Class<T = object, A extends unknown[] = any[]> = Constructor<
  T,
  A
> & {
  prototype: T
}

/**
 * Type of ECMAScript class constructors that extend the constructor `T`,
 * including the ability of specializing the constructor in derived types.
 */
export type ChildClassOf<
  BaseT extends abstract new (...args: any) => any,
  A extends unknown[] = any[]
> = Omit<BaseT, "constructor"> & Class<InstanceType<BaseT>, A>
