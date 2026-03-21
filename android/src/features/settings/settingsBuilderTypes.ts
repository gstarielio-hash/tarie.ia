import type { Dispatch, SetStateAction } from "react";

export type ValueSetter<T> = Dispatch<SetStateAction<T>> | ((value: T) => void);

export type OptionValidator = <TOptions extends readonly string[]>(
  value: unknown,
  options: TOptions,
) => value is TOptions[number];
