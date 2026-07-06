import Icon from '../Icon'

export default function UiToggle({ onUiMouseOver, onUiMouseOut, onUiMouseUp }) {
  return (
    <div
      className="node__word__ui node__word__ui--toggle"
      onMouseOver={onUiMouseOver}
      onMouseOut={onUiMouseOut}
      onMouseUp={onUiMouseUp}
    >
      <div className="node__word__ui__glyph">
        <Icon symbol="expand" wrapperClass="node__word__ui__glyph__svg node__word__ui__glyph__svg--expand" />
        <Icon symbol="collapse" wrapperClass="node__word__ui__glyph__svg node__word__ui__glyph__svg--collapse" />
      </div>
    </div>
  )
}
