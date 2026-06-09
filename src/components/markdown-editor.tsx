"use client";

import { useState } from "react";

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = "min-h-52",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20">
      <div className="flex justify-end gap-1 border-b border-white/[0.06] p-2">
        {["编辑", "预览"].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setPreview(index === 1)}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              preview === (index === 1)
                ? "bg-accent-purple/15 text-accent-purple"
                : "text-text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {preview ? (
        <MarkdownPreview value={value} className={`${minHeight} p-4`} />
      ) : (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${minHeight} w-full resize-y bg-transparent p-4 text-sm leading-7 text-text-secondary outline-none placeholder:text-text-muted`}
        />
      )}
    </div>
  );
}

export function MarkdownPreview({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  if (!value.trim()) {
    return <p className={`${className} text-sm text-text-muted`}>暂无内容</p>;
  }
  return (
    <div className={`${className} space-y-2 text-sm leading-7 text-text-secondary`}>
      {value.split("\n").map((line, index) => {
        if (line.startsWith("### ")) {
          return <h4 key={index} className="pt-2 font-semibold text-text-primary">{line.slice(4)}</h4>;
        }
        if (line.startsWith("## ")) {
          return <h3 key={index} className="pt-2 text-base font-semibold text-text-primary">{line.slice(3)}</h3>;
        }
        if (line.startsWith("# ")) {
          return <h2 key={index} className="pt-2 text-lg font-semibold text-text-primary">{line.slice(2)}</h2>;
        }
        if (line.startsWith("- ")) {
          return <p key={index} className="pl-3 before:mr-2 before:text-accent-green before:content-['•']">{line.slice(2)}</p>;
        }
        return <p key={index}>{line || "\u00a0"}</p>;
      })}
    </div>
  );
}
