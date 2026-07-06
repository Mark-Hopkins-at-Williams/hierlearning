export default function TreeExpansionControl({ mode, onClick }) {
  return (
    <div className="tree-expansion-control">
      <div className={`tree-expansion-control__glyph tree-expansion-control__glyph--${mode}`}>
        <div className="tree-expansion-control__glyph__triangle tree-expansion-control__glyph__triangle--down" />
        <div className="tree-expansion-control__glyph__triangle tree-expansion-control__glyph__triangle--up" />
        <div className="tree-expansion-control__glyph__triangle tree-expansion-control__glyph__triangle--left" />
        <div className="tree-expansion-control__glyph__triangle tree-expansion-control__glyph__triangle--right" />
      </div>
      <div className="tree-expansion-control__trigger" onClick={onClick} />
    </div>
  )
}
