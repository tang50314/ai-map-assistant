import { Streamdown } from "streamdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { useState, useEffect, useRef } from "react";

interface MarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const Markdown = ({ content, isStreaming }: MarkdownProps) => {
  // By changing the key, we force React to unmount the old Streamdown instance and mount a new one.
  // This is the most reliable way to force a full re-parse of the content after streaming is complete.
  const [remountTrigger, setRemountTrigger] = useState(0);
  const prevIsStreaming = useRef(isStreaming);

  useEffect(() => {
    // We only want to trigger a remount when the stream has *just* ended.
    const streamJustEnded =
      prevIsStreaming.current === true && isStreaming === false;
    if (streamJustEnded) {
      setRemountTrigger((trigger) => trigger + 1);
    }
    // Update the ref for the next render cycle.
    prevIsStreaming.current = isStreaming;
  }, [isStreaming]);

  return (
    <Streamdown
      key={remountTrigger}
      rehypePlugins={[rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      components={{
        a: ({ href, children, ...props }) => {
          // 识别脚注引用/返回以及本页内部链接，阻止打开新标签，改为页内平滑滚动
          const isFootnote =
            "data-footnote-ref" in props ||
            "data-footnote-backref" in props ||
            props.className === "data-footnote-backref" ||
            /#user-content-fn(ref)?-/.test(href || "");

          const hasHash = href && href.includes("#");
          let hash = "";
          if (hasHash) {
            hash = href!.slice(href!.indexOf("#")); // 保留 # 后部分
          }

          // 判断是否同源（绝对地址但和当前 origin 相同）
          let isSameOrigin = false;
          if (typeof window !== "undefined" && href) {
            try {
              const url = new URL(href, window.location.href);
              isSameOrigin = url.origin === window.location.origin;
            } catch {
              /* ignore */
            }
          }

          const isInternal =
            isFootnote || (hasHash && isSameOrigin) || href?.startsWith("#");

          const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (
            e
          ) => {
            if (!isInternal) return; // 外部链接保持默认
            e.preventDefault();
            if (!hash) return;
            const target = document.querySelector(hash);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
              // 更新地址栏 hash（不产生新的历史记录）
              if (typeof history !== "undefined") {
                history.replaceState(null, "", hash);
              }
            }
          };

          // 内部链接：去掉 target / rel，使用 hash 形式，避免完整 URL 触发新开页面策略
          if (isInternal) {
            return (
              <a href={hash || href} onClick={handleClick} {...props}>
                {children}
              </a>
            );
          }

          // 外部链接保持原逻辑（仍可新窗口）
          return (
            <a href={href} {...props}>
              {children}
            </a>
          );
        },
      }}
      className="prose prose-sm max-w-none dark:prose-invert prose-p:m-0 prose-p:leading-relaxed"
    >
      {content}
    </Streamdown>
  );
};

export default Markdown;