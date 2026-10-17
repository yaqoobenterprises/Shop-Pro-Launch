import { Children, isValidElement, ReactNode } from "react";

export type SelectOption = {
  value: string;
  label: ReactNode;
  searchText: string;
  disabled: boolean;
};

const textFromNode = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return textFromNode(node.props.children);
  return "";
};

export function readSelectOptions(children: ReactNode): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: unknown; disabled?: boolean; children?: ReactNode }>(child)) return [];
    if (child.type !== "option") return [];
    const label = child.props.children;
    return [{
      value: String(child.props.value ?? ""),
      label,
      searchText: textFromNode(label).toLocaleLowerCase(),
      disabled: Boolean(child.props.disabled),
    }];
  });
}
