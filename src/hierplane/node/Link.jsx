import LinkSvg from './LinkSvg'

const LINK_DATA = {
  left: {
    before: { capPos: 'top', viewBox: '0 0 21 14', fillPoints: '21.3,14 0.5,14 0.5,13.7 21.3,0.4', strokePoints: '0.5,14 0.5,13.7 21.3,0.4' },
    after:  { capPos: 'bottom', viewBox: '0 0 21 14', fillPoints: '21.3,-0.1 0.5,-0.1 0.5,0.3 21.3,13.6', strokePoints: '0.5,0 0.5,0.3 21.3,13.6' },
  },
  right: {
    before: { capPos: 'top', viewBox: '0 0 21 14', fillPoints: '-0.3,14 20.5,14 20.5,13.7 -0.3,0.4', strokePoints: '20.5,14 20.5,13.7 -0.3,0.4' },
    after:  { capPos: 'bottom', viewBox: '0 0 21 14', fillPoints: '-0.3,-0.1 20.5,-0.1 20.5,0.3 -0.3,13.6', strokePoints: '20.5,0 20.5,0.3 -0.3,13.6' },
  },
  inside: {
    before: { capPos: 'top', viewBox: '0 0 34 11', fillPoints: '17,1.2 0.5,10.7 0.5,11 33.5,11 33.5,10.7', strokePoints: '33.5,11 33.5,10.7 17,1.2 0.5,10.7 0.5,11' },
    after:  { capPos: 'bottom', viewBox: '0 0 34 11', fillPoints: '17,9.8 33.5,0.3 33.5,0 0.5,0 0.5,0.3', strokePoints: '0.5,0 0.5,0.3 17,9.8 33.5,0.3 33.5,0' },
  },
  down: {
    before: { capPos: 'left', viewBox: '0 0 14 21', fillPoints: '14.1,-0.3 14.1,20.5 13.7,20.5 0.4,-0.3', strokePoints: '14.1,20.5 13.7,20.5 0.4,-0.3' },
    after:  { capPos: 'right', viewBox: '0 0 14 21', fillPoints: '-0.1,-0.3 -0.1,20.5 0.3,20.5 13.6,-0.3', strokePoints: '0,20.5 0.3,20.5 13.6,-0.3' },
  },
}

export default function Link({ link, dataPos, layout, linkLabels, id }) {
  const displayLink = linkLabels?.[link] ?? link
  const pos = layout !== 'canonical' ? (dataPos || 'down') : 'down'
  const data = LINK_DATA[pos] || LINK_DATA.down

  return (
    <div className="node__word__link">
      <div className="node__word__link__tab">
        <LinkSvg {...data.before} />
        <div className="node__word__link__label">
          <span id={`node-${id}-link`} />
        </div>
        <LinkSvg {...data.after} />
      </div>
    </div>
  )
}
