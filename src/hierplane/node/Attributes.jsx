export default function Attributes({ attrs, id }) {
  return (
    <div className="node__word__attrs">
      {attrs?.length > 0 ? attrs.map(attr => (
        <div key={attr} className="node__word__attrs__item">
          <span id={`node-${id}-attr-${attr}`}>{attr}</span>
        </div>
      )) : null}
    </div>
  )
}
