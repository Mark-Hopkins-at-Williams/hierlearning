from flask import Flask, request, jsonify
from flask_cors import CORS
import transformers

# benepar calls T5TokenizerFast.build_inputs_with_special_tokens which was
# removed in transformers 5.x. Patch it back in before benepar loads.
if not hasattr(transformers.T5TokenizerFast, 'build_inputs_with_special_tokens'):
    def _t5_build_inputs(self, token_ids_0, token_ids_1=None):
        return token_ids_0 + [self.eos_token_id]
    transformers.T5TokenizerFast.build_inputs_with_special_tokens = _t5_build_inputs

import spacy
import benepar
from nltk.tree import Tree as NLTKTree

app = Flask(__name__)
CORS(app)

nlp = spacy.load('en_core_web_md')
if 'benepar' not in nlp.pipe_names:
    nlp.add_pipe('benepar', config={'model': 'benepar_en3'})

PHRASE_TYPES = {
    'S': 's', 'SINV': 's', 'SQ': 's',
    'SBAR': 'sbar', 'SBARQ': 'sbar',
    'NP': 'np', 'NAC': 'np', 'NX': 'np',
    'VP': 'vp',
    'PP': 'pp',
    'ADJP': 'adj', 'QP': 'adj',
    'ADVP': 'adv',
    'WHNP': 'wh', 'WHPP': 'wh', 'WHADVP': 'wh', 'WHADJP': 'wh',
    'PRN': 'prn',
    'RRC': 's',
    'UCP': 'coord',
    'FRAG': 's',
    'X': 'word',
    'INTJ': 'word',
    'LST': 'word',
    'META': 'word',
    'TOP': 's',
    'ROOT': 's',
}

POS_TYPES = {
    'NN': 'noun', 'NNS': 'noun',
    'NNP': 'propn', 'NNPS': 'propn',
    'PRP': 'pron', 'PRP$': 'pron',
    'WP': 'wh', 'WP$': 'wh', 'WRB': 'wh',
    'VB': 'verb', 'VBD': 'verb', 'VBG': 'verb', 'VBN': 'verb', 'VBP': 'verb', 'VBZ': 'verb',
    'MD': 'aux',
    'JJ': 'adj', 'JJR': 'adj', 'JJS': 'adj',
    'RB': 'adv', 'RBR': 'adv', 'RBS': 'adv',
    'DT': 'det', 'PDT': 'det', 'WDT': 'det',
    'IN': 'prep', 'TO': 'prep',
    'CC': 'cc',
    'CD': 'num',
    'EX': 'word', 'FW': 'word', 'LS': 'word', 'SYM': 'word', 'UH': 'word',
    'RP': 'adv',
    'POS': 'word',
    '$': 'word', '#': 'word',
}

PUNCT_POS = {'.', ',', ':', '-LRB-', '-RRB-', "''", '``', 'HYPH', 'NFP', 'ADD', 'GW', 'XX', 'SYM'}

NODE_TYPE_TO_STYLE = {
    's':     ['color5', 'strong'],
    'sbar':  ['color5'],
    'np':    ['color4', 'strong'],
    'vp':    ['color6', 'strong'],
    'pp':    ['color3', 'strong'],
    'verb':  ['color6'],
    'aux':   ['color7'],
    'pron':  ['color4'],
    'propn': ['color4', 'strong'],
    'noun':  ['color4'],
    'adj':   ['color5'],
    'det':   ['color8'],
    'prep':  ['color3'],
    'adv':   ['color7'],
    'coord': ['color8', 'strong'],
    'cc':    ['color8', 'strong'],
    'conj':  ['color8'],
    'num':   ['color5'],
    'word':  ['color4'],
    'wh':    ['color4'],
    'prn':   ['color4'],
}


def collect_spans(node):
    spans = []
    if 'spans' in node:
        spans.extend(node['spans'])
    for c in node.get('children', []):
        spans.extend(collect_spans(c))
    return spans


def span_word(children, text):
    spans = []
    for c in children:
        spans.extend(collect_spans(c))
    if not spans:
        return ''
    lo = min(s['start'] for s in spans)
    hi = max(s['end'] for s in spans)
    return text[lo:hi]


def walk(nltk_node, tokens, idx, punct_tokens, text):
    """
    Recursively walk an NLTK constituency tree.
    idx is a one-element list used as a mutable counter over tokens.

    Returns a minimal parse node dict, or None for punct leaves:
      {tag, word, spans}              for leaves
      {tag, word, children}           for phrases
    'tag' is the raw Penn Treebank label. 'nodeType'/'link' overrides are
    only added where a node's display needs to diverge from what its tag
    would naturally produce (coordination wrapping, below). Everything else
    is filled in later by to_hierplane().
    """
    label = nltk_node.label()

    # Leaf: single string child means this is a preterminal (POS + word)
    if len(nltk_node) == 1 and isinstance(nltk_node[0], str):
        tok = tokens[idx[0]]
        idx[0] += 1

        if label in PUNCT_POS or tok.is_punct:
            punct_tokens.append({
                'text': tok.text,
                'start': tok.idx,
                'end': tok.idx + len(tok.text),
            })
            return None

        return {
            'tag': label,
            'word': tok.text,
            'spans': [{'start': tok.idx, 'end': tok.idx + len(tok.text)}],
        }

    # Internal node: recurse into children
    children = []
    for child in nltk_node:
        if isinstance(child, str):
            continue
        child_node = walk(child, tokens, idx, punct_tokens, text)
        if child_node is not None:
            children.append(child_node)

    if not children:
        return None

    word = span_word(children, text)

    # Wrap coordinated structures: phrase has a CC child
    has_cc = any(c['tag'] == 'CC' for c in children)
    if has_cc and PHRASE_TYPES.get(label, 'word') != 'coord':
        children = [{**c, 'link': 'coord'} for c in children]
        return {'tag': label, 'word': word, 'nodeType': 'coord', 'children': children}

    return {'tag': label, 'word': word, 'children': children}


def collapse_unary(node):
    if node is None:
        return None
    if 'children' not in node:
        return node
    children = [collapse_unary(c) for c in node['children']]
    children = [c for c in children if c is not None]
    if not children:
        return {k: v for k, v in node.items() if k != 'children'}
    if len(children) == 1:
        # Collapse: promote child, but keep the parent's tag as the displayed link
        child = children[0]
        return {**child, 'link': node.get('link', node['tag'])}
    return {**node, 'children': children}


def to_hierplane(node):
    """
    Translate a minimal parse node (tag/word/spans|children, with optional
    nodeType/link overrides) into the hierplane node format that Tree
    expects: {nodeType, word, link, spans|children}.
    """
    is_leaf = 'spans' in node
    default_types = POS_TYPES if is_leaf else PHRASE_TYPES
    result = {
        'nodeType': node.get('nodeType', default_types.get(node['tag'], 'word')),
        'word': node['word'],
        'link': node.get('link', node['tag']),
    }
    if is_leaf:
        result['spans'] = node['spans']
    else:
        result['children'] = [to_hierplane(c) for c in node['children']]
    return result


@app.route('/api/parse', methods=['POST'])
def parse():
    data = request.get_json(silent=True) or {}
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    try:
        doc = nlp(text)
        sentences = list(doc.sents)
        if not sentences:
            return jsonify({'error': 'Could not parse sentence'}), 400

        sent = sentences[0]
        parse_str = sent._.parse_string
        nltk_tree = NLTKTree.fromstring(parse_str)

        tokens = list(sent)
        punct_tokens = []
        idx = [0]

        root = walk(nltk_tree, tokens, idx, punct_tokens, text)
        if root is None:
            return jsonify({'error': 'Parse produced empty tree'}), 400

        root = collapse_unary(root)
        root['link'] = 'ROOT'

        return jsonify({
            'text': text,
            'root': to_hierplane(root),
            'punctTokens': punct_tokens,
            'nodeTypeToStyle': NODE_TYPE_TO_STYLE,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print('Starting parser server on http://localhost:5001')
    app.run(port=5001, debug=False)
