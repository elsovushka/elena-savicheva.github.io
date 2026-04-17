import os
from typing import Dict

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


class AIAnalyst:
    """AI-аналитик на основе Google Gemini."""

    def __init__(self):
        self.enabled = False
        if GEMINI_AVAILABLE:
            api_key = os.getenv('GEMINI_API_KEY')
            if api_key:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel('gemini-1.5-flash')
                self.enabled = True
            else:
                print("⚠️  GEMINI_API_KEY не задан. Используется встроенный анализ.")
        else:
            print("⚠️  Библиотека google-generativeai не установлена. Используется встроенный анализ.")

    def analyze_changes(self, before: Dict, after: Dict) -> str:
        if self.enabled:
            try:
                return self._gemini_analysis(before, after)
            except Exception as e:
                print(f"Ошибка Gemini: {e}")
        return self._rule_based_analysis(before, after)

    def analyze_single(self, results: Dict) -> str:
        """Анализ одного сценария (без сравнения)."""
        if self.enabled:
            try:
                return self._gemini_single(results)
            except Exception as e:
                print(f"Ошибка Gemini: {e}")
        return self._rule_based_single(results)

    # ─────────────────────────────────────────────────────────────────
    # GEMINI
    # ─────────────────────────────────────────────────────────────────

    def _gemini_analysis(self, before: Dict, after: Dict) -> str:
        prompt = f"""Ты — опытный финансовый аналитик по инвестициям в недвижимость.

Проанализируй изменения в финансовой модели проекта.

ПОКАЗАТЕЛИ ДО:
NPV: {before['npv']:,.0f} ₽  |  IRR: {before['irr']:.1f}%  |  PI: {before['pi']:.2f}
Payback: {before['payback']} кв.  |  DSCR: {before['dscr']:.2f}x  |  Equity IRR: {before['equity_irr']:.1f}%

ПОКАЗАТЕЛИ ПОСЛЕ:
NPV: {after['npv']:,.0f} ₽  |  IRR: {after['irr']:.1f}%  |  PI: {after['pi']:.2f}
Payback: {after['payback']} кв.  |  DSCR: {after['dscr']:.2f}x  |  Equity IRR: {after['equity_irr']:.1f}%

Задачи:
1. Какие показатели изменились значительно (>10%)?
2. Почему это произошло?
3. Есть ли риски?
4. Что рекомендуешь?

Ответь КРАТКО (максимум 200 слов). Используй эмодзи: 📊 для данных, ⚠️ для рисков, 💡 для рекомендаций."""
        response = self.model.generate_content(prompt)
        return response.text

    def _gemini_single(self, results: Dict) -> str:
        prompt = f"""Ты — опытный финансовый аналитик по инвестициям в недвижимость.

Проанализируй показатели инвестпроекта:
NPV: {results['npv']:,.0f} ₽
IRR: {results['irr']:.1f}%
Equity IRR: {results['equity_irr']:.1f}%
PI: {results['pi']:.2f}
Срок окупаемости: {results['payback']} кв.
Мин. DSCR: {results['dscr']:.2f}x
Общая выручка: {results['total_revenue']:,.0f} ₽
Общий CAPEX: {results['total_capex']:,.0f} ₽

Дай краткую оценку привлекательности проекта, укажи риски и рекомендации.
Максимум 150 слов. Используй эмодзи: 📊 для данных, ⚠️ для рисков, 💡 для рекомендаций."""
        response = self.model.generate_content(prompt)
        return response.text

    # ─────────────────────────────────────────────────────────────────
    # RULE-BASED FALLBACK
    # ─────────────────────────────────────────────────────────────────

    def _rule_based_analysis(self, before: Dict, after: Dict) -> str:
        lines = []

        def pct_change(a, b):
            if a == 0:
                return 0
            return (b - a) / abs(a) * 100

        npv_ch = pct_change(before['npv'], after['npv'])
        irr_ch = pct_change(before['irr'], after['irr'])

        if abs(npv_ch) > 10:
            icon = "📈" if npv_ch > 0 else "📉"
            lines.append(f"{icon} NPV изменился на {npv_ch:+.1f}% → {after['npv']:,.0f} ₽")
        if abs(irr_ch) > 10:
            icon = "📈" if irr_ch > 0 else "📉"
            lines.append(f"{icon} IRR изменился на {irr_ch:+.1f}% → {after['irr']:.1f}%")

        lines.extend(self._common_risks(after))

        if not lines:
            lines.append("✅ Показатели изменились незначительно. Модель стабильна.")
        return "\n".join(lines)

    def _rule_based_single(self, results: Dict) -> str:
        lines = []
        npv = results.get('npv', 0)
        irr = results.get('irr', 0)
        pi = results.get('pi', 0)
        dscr = results.get('dscr', 0)
        payback = results.get('payback', -1)

        if npv > 0:
            lines.append(f"📊 NPV положительный ({npv:,.0f} ₽) — проект создаёт стоимость.")
        else:
            lines.append(f"⚠️ NPV отрицательный ({npv:,.0f} ₽) — проект разрушает стоимость!")

        if irr > 20:
            lines.append(f"📊 IRR = {irr:.1f}% — выше ставки дисконтирования, проект привлекателен.")
        elif irr > 0:
            lines.append(f"⚠️ IRR = {irr:.1f}% — может быть ниже требуемой доходности.")
        else:
            lines.append(f"⚠️ IRR = {irr:.1f}% — проект не окупается!")

        if pi >= 1.3:
            lines.append(f"📊 PI = {pi:.2f} — хороший запас рентабельности.")
        elif pi >= 1.0:
            lines.append(f"📊 PI = {pi:.2f} — минимально приемлемый уровень.")
        else:
            lines.append(f"⚠️ PI = {pi:.2f} — проект убыточен!")

        lines.extend(self._common_risks(results))

        if payback > 0:
            lines.append(f"💡 Срок окупаемости: {payback} кварталов ({payback/4:.1f} лет).")
        else:
            lines.append("⚠️ Проект не окупается в горизонте планирования.")

        return "\n".join(lines)

    @staticmethod
    def _common_risks(results: Dict) -> List[str]:
        lines = []
        dscr = results.get('dscr', 0)
        irr = results.get('irr', 0)
        npv = results.get('npv', 0)

        if 0 < dscr < 1.2:
            lines.append(f"⚠️ DSCR = {dscr:.2f} — критически низкий! Риск дефолта по кредиту.")
            lines.append("💡 Рекомендация: увеличьте собственный капитал или снизьте долг.")
        elif 1.2 <= dscr < 1.5:
            lines.append(f"⚠️ DSCR = {dscr:.2f} — ниже комфортного уровня (1.5x).")

        if 0 < irr < 15:
            lines.append(f"⚠️ IRR = {irr:.1f}% — ниже рыночной доходности по недвижимости.")
            lines.append("💡 Рекомендация: повысьте цену продажи или снизьте CAPEX.")

        if npv < 0:
            lines.append("⚠️ NPV отрицательный — пересмотрите ключевые параметры.")

        return lines


# Аннотация для type hints в _common_risks
from typing import List  # noqa: E402
