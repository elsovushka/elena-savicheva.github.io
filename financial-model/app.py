from flask import Flask, render_template, request, jsonify
from model import FinancialModel
from ai_analyst import AIAnalyst
from database import Database
import os

app = Flask(__name__)
db = Database()
analyst = AIAnalyst()

previous_state = None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/calculate', methods=['POST'])
def calculate():
    global previous_state
    params = request.json
    if not params:
        return jsonify({'success': False, 'error': 'No params provided'}), 400

    try:
        model = FinancialModel(params)
        results = model.calculate()
        cashflow = model.get_cashflow()

        ai_analysis = None
        if previous_state:
            ai_analysis = analyst.analyze_changes(before=previous_state, after=results)

        previous_state = results.copy()

        return jsonify({'success': True, 'results': results, 'ai_analysis': ai_analysis, 'cashflow': cashflow})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/save', methods=['POST'])
def save_scenario():
    data = request.json
    try:
        scenario_id = db.save_scenario(
            name=data['name'],
            params=data['params'],
            results=data['results']
        )
        return jsonify({'success': True, 'id': scenario_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/load/<int:scenario_id>')
def load_scenario(scenario_id):
    scenario = db.load_scenario(scenario_id)
    if scenario:
        return jsonify(scenario)
    return jsonify({'error': 'Not found'}), 404


@app.route('/scenarios')
def list_scenarios():
    return jsonify(db.list_scenarios())


@app.route('/scenarios/<int:scenario_id>', methods=['DELETE'])
def delete_scenario(scenario_id):
    try:
        db.delete_scenario(scenario_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/compare', methods=['POST'])
def compare_scenarios():
    scenario_ids = request.json.get('ids', [])
    scenarios = [db.load_scenario(sid) for sid in scenario_ids]
    scenarios = [s for s in scenarios if s is not None]
    return jsonify(scenarios)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
