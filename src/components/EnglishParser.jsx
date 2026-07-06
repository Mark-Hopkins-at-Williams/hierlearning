import { useState, useEffect, useRef } from "react";
import { Tree } from "../hierplane";
import { parseSentence } from "../api/parse";
import { loadTranslations, saveTranslations } from "../api/translations";

export default function EnglishParser() {
  const [tree, setTree] = useState(null);
  const [treeKey, setTreeKey] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState(null);
  const [translations, setTranslations] = useState([]);
  const [restoreData, setRestoreData] = useState(null);
  const latestRef = useRef({});
  const headerRowRef = useRef(null);
  const headingRef = useRef(null);
  const sheepRef = useRef(null);
  const bubbleRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    const row = headerRowRef.current;
    const h4 = headingRef.current;
    if (
      !row ||
      !h4 ||
      !sheepRef.current ||
      !bubbleRef.current ||
      !svgRef.current
    )
      return;
    const rightSide = sheepRef.current;
    const bubble = bubbleRef.current;
    const sheepSvg = svgRef.current;

    function measure() {
      // Ensure full state before measuring
      rightSide.style.visibility = "visible";
      bubble.style.display = "";
      h4.style.fontSize = "4.5em";
      const headingW = h4.scrollWidth;
      const fullRightW = rightSide.offsetWidth;
      const svgW = sheepSvg.getBoundingClientRect().width;
      return {
        thresholdFull: headingW + fullRightW + 16,
        thresholdSheep: headingW + svgW + 16,
      };
    }

    let thresholds = measure();

    document.fonts.ready.then(() => {
      thresholds = measure();
      lastWidth = -1;
      fit();
    });

    let lastWidth = -1;
    function fit() {
      const rowWidth = row.clientWidth;
      if (rowWidth === lastWidth) return;
      lastWidth = rowWidth;
      if (rowWidth >= thresholds.thresholdFull) {
        bubble.style.display = "";
        rightSide.style.visibility = "visible";
      } else if (rowWidth >= thresholds.thresholdSheep) {
        bubble.style.display = "none";
        rightSide.style.visibility = "visible";
      } else {
        bubble.style.display = "";
        rightSide.style.visibility = "hidden";
      }
    }
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    fit();
    return () => ro.disconnect();
  }, []);

  useEffect(() => { latestRef.current = { tree, translation, translations } })

  useEffect(() => {
    loadTranslations()
      .then(setTranslations)
      .catch(() => {});
  }, []);

  const doSave = async (currentTree, currentTranslation, currentTranslations) => {
    if (!currentTree || !currentTranslation) return;
    const existing = currentTranslations.find((r) => r.source === currentTree.text);
    const record = {
      id: existing?.id ?? String(Date.now()),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: currentTree.text,
      tree: currentTree,
      translation: currentTranslation.state,
      preview: currentTranslation.preview,
    };
    const updated = existing
      ? currentTranslations.map((r) => r.source === currentTree.text ? record : r)
      : [record, ...currentTranslations];
    setTranslations(updated);
    await saveTranslations(updated);
  };

  const parse = async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    const { tree: currentTree, translation: currentTranslation, translations: currentTranslations } = latestRef.current;
    if (currentTranslation?.hasChanges) {
      doSave(currentTree, currentTranslation, currentTranslations);
    }
    setLoading(true);
    setError(null);
    try {
      const result = await parseSentence(trimmed);
      setTree(result);
      setRestoreData(null);
    } catch (e) {
      setError(e.message);
      setTree(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    const { tree, translation, translations } = latestRef.current;
    doSave(tree, translation, translations);
  };

  const handleDelete = async (id) => {
    const updated = translations.filter((r) => r.id !== id);
    setTranslations(updated);
    await saveTranslations(updated);
  };

  const handleLoad = async (record) => {
    let parsed = record.tree ?? null;
    if (!parsed) {
      try {
        parsed = await parseSentence(record.source);
      } catch (_) {}
    }
    if (!parsed) {
      setError("Could not reload parse");
      return;
    }
    setTree(parsed);
    setError(null);
    // Support both new format (translation blob) and old saved records (bare fields)
    setRestoreData(record.translation ?? {
      targetTokens: record.targetTokens,
      wordOverrides: record.wordOverrides,
    });
    setTreeKey((k) => k + 1);
  };

  return (
    <div style={{ padding: "10px 30px" }}>
      <div
        ref={headerRowRef}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "4px",
          marginBottom: "10px",
        }}
      >
        <h4
          ref={headingRef}
          className="header1"
          id="english-parser"
          style={{
            fontFamily: "'Supermercado One', sans-serif",
            margin: 0,
            whiteSpace: "nowrap",
          }}
        >
          hierlearning
        </h4>
        <div
          ref={sheepRef}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexShrink: 0,
          }}
        >
          <div
            ref={bubbleRef}
            style={{
              position: "relative",
              background: "#7ab3d9",
              border: "1.5px solid #5a9fc4",
              borderRadius: "14px",
              padding: "7px 14px",
              fontSize: "0.82em",
              color: "black",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              fontFamily: "'Atkinson Hyperlegible Mono', monospace",
            }}
          >
            TEACH ME A NEW LANGUAGE!
            <span
              style={{
                position: "absolute",
                right: "-11px",
                top: "50%",
                transform: "translateY(-50%)",
                width: 0,
                height: 0,
                borderStyle: "solid",
                borderWidth: "7px 0 7px 11px",
                borderColor: "transparent transparent transparent #5a9fc4",
              }}
            />
            <span
              style={{
                position: "absolute",
                right: "-9px",
                top: "50%",
                transform: "translateY(-50%)",
                width: 0,
                height: 0,
                borderStyle: "solid",
                borderWidth: "6px 0 6px 9px",
                borderColor: "transparent transparent transparent #7ab3d9",
              }}
            />
          </div>
          <svg
            ref={svgRef}
            width="82"
            height="82"
            viewBox="0 0 62 56"
            style={{ flexShrink: 0, display: "block" }}
          >
            <ellipse
              cx="51"
              cy="16"
              rx="4"
              ry="4"
              fill="white"
              stroke="#ccc"
              strokeWidth="1"
            />
            <ellipse cx="25" cy="37" rx="4" ry="4" fill="white" />
            <ellipse cx="40" cy="37" rx="4" ry="4" fill="white" />
            <ellipse
              cx="32"
              cy="22"
              rx="18"
              ry="13"
              fill="white"
              stroke="#ccc"
              strokeWidth="1"
            />
            <ellipse
              cx="11"
              cy="14"
              rx="11"
              ry="10"
              fill="#f8f8f6"
              stroke="#ccc"
              strokeWidth="1"
            />
            <ellipse cx="7" cy="11" rx="3.5" ry="3" fill="white" />
            <ellipse cx="7.5" cy="11" rx="2" ry="2" fill="#222" />
            <ellipse cx="2.8" cy="10.5" rx="2" ry="2" fill="#222" />
          </svg>
        </div>
      </div>

      {error && <p style={{ color: "red", marginBottom: "12px" }}>{error}</p>}

      <Tree
        key={treeKey}
        tree={tree}
        onReparse={parse}
        loading={loading}
        onTranslationChange={setTranslation}
        initialTranslation={restoreData}
      />
      {tree && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "10px",
          }}
        >
          <button
            onClick={handleSave}
            style={{
              padding: "6px 16px",
              fontSize: "0.9em",
              cursor: "pointer",
              borderRadius: "4px",
              border: "1px solid #aaa",
            }}
          >
            Save translation
          </button>
        </div>
      )}

      {translations.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <h5
            className="header1"
            style={{ marginBottom: "12px", fontSize: "1em" }}
          >
            Saved translations
          </h5>
          {translations.map((record) => (
            <div
              key={record.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "10px 14px",
                marginBottom: "8px",
                borderRadius: "5px",
                border: "1px solid #aaa",
                fontSize: "0.88em",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="textcolor"
                  style={{ fontWeight: 600, marginBottom: "2px" }}
                >
                  {record.source}
                </div>
                <div className="textcolor" style={{ opacity: 0.7 }}>
                  {record.preview}
                </div>
                <div
                  style={{
                    opacity: 0.45,
                    fontSize: "0.85em",
                    marginTop: "3px",
                  }}
                >
                  {new Date(record.createdAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <button
                  onClick={() => handleLoad(record)}
                  style={{
                    padding: "4px 10px",
                    cursor: "pointer",
                    borderRadius: "3px",
                    border: "1px solid #aaa",
                    fontSize: "0.9em",
                  }}
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(record.id)}
                  style={{
                    padding: "4px 8px",
                    cursor: "pointer",
                    borderRadius: "3px",
                    border: "1px solid #aaa",
                    fontSize: "0.9em",
                    opacity: 0.6,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
