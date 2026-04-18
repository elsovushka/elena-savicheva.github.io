import numpy_financial as npf
from typing import Dict, List, Optional


class FinancialModel:
    """
    Финансовая модель инвестпроекта в недвижимость.
    Расчёт по кварталам: Q0 (покупка) .. Q[horizon-1].
    """

    def __init__(self, params: Dict):
        self.p = params
        self.quarters = int(params.get('horizon', 13))  # Q0..Q12 по умолчанию

    # ─────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────────────────────────────

    def calculate(self) -> Dict:
        cf = self._build_cashflow()
        equity_cf = self._equity_cashflow(cf)

        # Project metrics — unlevered free cash flow (without debt service)
        npv_val        = self._npv(cf['unlevered_cashflow'])
        irr_val        = self._irr(cf['unlevered_cashflow'])
        pi_val         = self._pi(cf['unlevered_cashflow'])
        payback_val    = self._payback(cf['unlevered_cashflow'])

        # Equity metrics — after debt drawdowns and repayment
        equity_irr_val = self._irr(equity_cf)
        min_dscr       = self._min_dscr(cf)

        return {
            'npv':                round(npv_val, 2),
            'irr':                round(irr_val * 100, 2),
            'equity_irr':         round(equity_irr_val * 100, 2),
            'pi':                 round(pi_val, 3),
            'payback':            payback_val,
            'dscr':               round(min_dscr, 3),
            'total_revenue':      round(sum(cf['revenue']), 2),
            'total_capex':        round(sum(abs(x) for x in cf['capex']), 2),
            'total_opex':         round(sum(abs(x) for x in cf['opex']), 2),
            'total_tax':          round(sum(abs(x) for x in cf['taxes']), 2),
            'total_debt_service': round(sum(abs(x) for x in cf['debt_service']), 2),
            'net_profit':         round(sum(cf['unlevered_cashflow']), 2),
        }

    def get_cashflow(self) -> Dict:
        cf = self._build_cashflow()
        return {k: [round(v, 2) for v in vals] for k, vals in cf.items() if k != 'unlevered_cashflow'}

    # ─────────────────────────────────────────────────────────────────
    # CASHFLOW BUILDER
    # ─────────────────────────────────────────────────────────────────

    def _build_cashflow(self) -> Dict[str, List[float]]:
        p = self.p
        Q = self.quarters

        # Строим график кредита один раз
        loan_schedule = self._build_loan_schedule()

        revenue = []
        capex = []
        opex = []
        taxes = []
        debt_service = []
        unlevered_cashflow = []   # project IRR/NPV (no debt service)
        free_cashflow = []        # levered (after debt)
        cumulative_cashflow = []
        cumulative = 0.0

        for q in range(Q):
            rev = self._revenue(q)
            cap = self._capex(q)
            ope = self._opex(q)
            tax = self._taxes(q, rev, cap, ope)
            ds = loan_schedule[q] if q < len(loan_schedule) else 0.0

            unlev = rev + cap + ope + tax          # unlevered (project)
            lev   = unlev + ds                      # levered (equity + debt)

            revenue.append(rev)
            capex.append(cap)
            opex.append(ope)
            taxes.append(tax)
            debt_service.append(ds)
            unlevered_cashflow.append(unlev)
            free_cashflow.append(lev)
            cumulative += lev
            cumulative_cashflow.append(cumulative)

        return {
            'quarters': list(range(Q)),
            'revenue': revenue,
            'capex': capex,
            'opex': opex,
            'taxes': taxes,
            'debt_service': debt_service,
            'unlevered_cashflow': unlevered_cashflow,
            'free_cashflow': free_cashflow,
            'cumulative_cashflow': cumulative_cashflow,
        }

    # ─────────────────────────────────────────────────────────────────
    # COMPONENT CALCULATIONS
    # ─────────────────────────────────────────────────────────────────

    def _revenue(self, q: int) -> float:
        return self._rent(q) + self._sales(q)

    def _rent(self, q: int) -> float:
        p = self.p
        start = int(p.get('rent_start_q', 5))
        end = int(p.get('rent_end_q', 8))
        if q < start or q > end:
            return 0.0

        offset = q - start
        # occupancy_schedule: список % по кварталам аренды
        schedule = p.get('occupancy_schedule', [])
        if offset < len(schedule):
            occ = float(schedule[offset]) / 100.0
        else:
            occ = float(p.get('occupancy_default', 100)) / 100.0

        monthly = float(p.get('rent_monthly', 45000))
        apts = int(p.get('apartments', 20))
        return monthly * apts * occ * 3  # 3 месяца в квартале

    def _sales(self, q: int) -> float:
        p = self.p
        start = int(p.get('sale_start_q', 9))
        if q < start:
            return 0.0
        idx = q - start
        schedule = p.get('sale_schedule', [])
        if idx >= len(schedule):
            return 0.0
        n_apts = float(schedule[idx])
        area = float(p.get('area', 1200))
        apts_total = int(p.get('apartments', 20))
        avg_area = area / apts_total
        price = float(p.get('sale_price', 230000))
        return n_apts * avg_area * price

    def _capex(self, q: int) -> float:
        p = self.p
        area = float(p.get('area', 1200))

        if q == 0:
            purchase = area * float(p.get('purchase_price', 110000))
            extra = float(p.get('extra_costs', 2432000))
            return -(purchase + extra)

        recon_period = int(p.get('reconstruction_period', 4))
        if 1 <= q <= recon_period:
            total_recon = area * float(p.get('reconstruction_price', 45000))
            # Пользовательский график распределения (%)
            recon_schedule = p.get('reconstruction_schedule', [])
            if len(recon_schedule) >= recon_period:
                pct = float(recon_schedule[q - 1]) / 100.0
            else:
                pct = 1.0 / recon_period
            return -(total_recon * pct)

        return 0.0

    def _opex(self, q: int) -> float:
        p = self.p
        start = int(p.get('rent_start_q', 5))
        end = int(p.get('rent_end_q', 8))
        # OPEX начисляется весь период проекта после начала аренды
        if q < start or q > end:
            return 0.0
        monthly = float(p.get('opex_monthly', 175000))
        return -(monthly * 3)

    def _taxes(self, q: int, revenue: float, capex_q: float, opex_q: float) -> float:
        p = self.p
        if q == 0:
            return 0.0

        # Налог на имущество
        area = float(p.get('area', 1200))
        total_capex = area * (float(p.get('purchase_price', 110000)) + float(p.get('reconstruction_price', 45000)))
        total_capex += float(p.get('extra_costs', 2432000))
        depr_rate = float(p.get('depreciation_rate', 2.0)) / 100.0 / 4  # квартальная
        # Остаточная стоимость (линейная амортизация)
        residual = total_capex * max(0.0, 1.0 - depr_rate * q)
        prop_tax_rate = float(p.get('property_tax_rate', 2.2)) / 100.0 / 4  # квартальная
        property_tax = residual * prop_tax_rate

        # УСН
        usn = 0.0
        if revenue > 0:
            usn_rate = float(p.get('usn_rate', 15)) / 100.0
            usn_mode = p.get('usn_mode', 'income_expense')  # 'income' | 'income_expense'
            if usn_mode == 'income':
                # УСН 6% с доходов
                usn = revenue * usn_rate
            else:
                # УСН 15% с (доходы − расходы), мин 1%
                expenses = abs(opex_q)
                # Амортизация как расход при УСН
                amort_q = total_capex * depr_rate
                base = revenue - expenses - amort_q
                if base > 0:
                    usn = base * usn_rate
                else:
                    usn = revenue * 0.01  # минимальный налог 1%
                usn = max(usn, revenue * 0.01)

        return -(property_tax + usn)

    # ─────────────────────────────────────────────────────────────────
    # LOAN SCHEDULE
    # ─────────────────────────────────────────────────────────────────

    def _build_loan_schedule(self) -> List[float]:
        p = self.p
        Q = self.quarters
        area = float(p.get('area', 1200))
        total_capex = area * (float(p.get('purchase_price', 110000)) + float(p.get('reconstruction_price', 45000)))
        total_capex += float(p.get('extra_costs', 2432000))

        debt_ratio = float(p.get('debt_ratio', 60)) / 100.0
        loan_total = total_capex * debt_ratio
        annual_rate = float(p.get('interest_rate', 14.5)) / 100.0
        q_rate = annual_rate / 4.0
        loan_period = int(p.get('loan_period', 16))
        grace_period = int(p.get('grace_period', 4))  # только % без погашения тела

        # График выборки кредита (по кварталам, % от суммы кредита)
        drawdown_schedule = p.get('drawdown_schedule', [])
        recon_period = int(p.get('reconstruction_period', 4))

        # Если пользователь не задал — выбираем пропорционально CAPEX
        if not drawdown_schedule or len(drawdown_schedule) < (recon_period + 1):
            # Q0: доля покупки, Q1..recon: доля реконструкции
            purchase = area * float(p.get('purchase_price', 110000)) + float(p.get('extra_costs', 2432000))
            recon = area * float(p.get('reconstruction_price', 45000))
            drawdown_schedule = [round(purchase / total_capex * 100, 4)]
            for _ in range(recon_period):
                drawdown_schedule.append(round(recon / total_capex / recon_period * 100, 4))

        # Накопленный остаток долга по кварталам
        balance = [0.0] * Q
        drawdowns = [0.0] * Q
        for i, pct in enumerate(drawdown_schedule):
            if i < Q:
                drawdowns[i] = loan_total * float(pct) / 100.0

        # Расчёт остатка
        running_balance = 0.0
        for q in range(Q):
            running_balance += drawdowns[q]
            balance[q] = running_balance

        # Погашение тела долга (аннуитет после льготного периода)
        repay_start = grace_period + 1
        repay_quarters = loan_period - grace_period
        if repay_quarters <= 0:
            repay_quarters = 1

        # Упрощённый аннуитет: равные платежи по основному долгу
        principal_per_q = loan_total / repay_quarters if repay_quarters > 0 else 0

        schedule = [0.0] * Q
        remaining = loan_total

        for q in range(Q):
            if balance[q] == 0:
                continue
            # Проценты на остаток долга
            interest = remaining * q_rate
            # Погашение основного долга
            if q >= repay_start:
                principal = min(principal_per_q, remaining)
                remaining = max(0.0, remaining - principal)
            else:
                principal = 0.0
            schedule[q] = -(interest + principal)

        return schedule

    # ─────────────────────────────────────────────────────────────────
    # EQUITY CASHFLOW
    # ─────────────────────────────────────────────────────────────────

    def _equity_cashflow(self, cf: Dict) -> List[float]:
        """Поток только собственных средств (без кредита)."""
        p = self.p
        debt_ratio = float(p.get('debt_ratio', 60)) / 100.0
        equity_cf = []
        for q in range(self.quarters):
            rev = cf['revenue'][q]
            cap = cf['capex'][q]
            ope = cf['opex'][q]
            tax = cf['taxes'][q]
            ds = cf['debt_service'][q]
            # Инвестиции только в части собственных средств
            equity_cap = cap * (1 - debt_ratio)
            net = rev + equity_cap + ope + tax + ds
            equity_cf.append(net)
        return equity_cf

    # ─────────────────────────────────────────────────────────────────
    # METRICS
    # ─────────────────────────────────────────────────────────────────

    def _npv(self, cf: List[float]) -> float:
        rate = float(self.p.get('discount_rate', 20)) / 100.0 / 4  # квартальная
        return float(npf.npv(rate, cf))

    def _irr(self, cf: List[float]) -> float:
        try:
            irr_q = float(npf.irr(cf))
            if irr_q != irr_q:  # NaN
                return 0.0
            return ((1 + irr_q) ** 4) - 1  # Годовая
        except Exception:
            return 0.0

    def _pi(self, cf: List[float]) -> float:
        npv_val = self._npv(cf)
        investment = sum(abs(x) for x in cf if x < 0)
        if investment == 0:
            return 0.0
        return (npv_val + investment) / investment

    def _payback(self, cf: List[float]) -> int:
        cumulative = 0.0
        for q, val in enumerate(cf):
            cumulative += val
            if cumulative >= 0:
                return q
        return -1

    def _min_dscr(self, cf: Dict) -> float:
        """Минимальный DSCR только в операционных кварталах (выручка > 0)."""
        dscr_values = []
        for q in range(self.quarters):
            ds = abs(cf['debt_service'][q])
            rev = cf['revenue'][q]
            if ds < 1 or rev <= 0:
                continue
            noi = rev + cf['opex'][q]  # opex already negative
            dscr_values.append(noi / ds)
        return min(dscr_values) if dscr_values else 0.0
