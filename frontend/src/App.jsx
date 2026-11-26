import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  LineSeries,
} from 'lightweight-charts'
import './App.css'

const currencies = [
  { code: 'R01235', label: 'USD / RUB', name: 'Доллар США' },
  { code: 'R01239', label: 'EUR / RUB', name: 'Евро' },
  { code: 'R01035', label: 'GBP / RUB', name: 'Фунт стерлингов' },
  { code: 'R01375', label: 'CNY / RUB', name: 'Китайский юань' },
]

const periods = [
  { label: '1М', days: 30 },
  { label: '3М', days: 90 },
  { label: '6М', days: 180 },
  { label: '1Г', days: 365 },
  { label: '5Л', days: 1825 },
]

const formatRate = (value) =>
  new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value)

const formatDate = (value) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(new Date(`${value}T12:00:00+03:00`))

function ExchangeChart({ data, levels, trendLines, onChartClick, activeTool }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const overlayRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: '#0d1117' },
        textColor: '#7d8590',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1b222c' },
        horzLines: { color: '#1b222c' },
      },
      crosshair: {
        vertLine: { color: '#65758b', labelBackgroundColor: '#293344' },
        horzLine: { color: '#65758b', labelBackgroundColor: '#293344' },
      },
      rightPriceScale: {
        borderColor: '#252d38',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: '#252d38',
        timeVisible: false,
        rightOffset: 3,
      },
      localization: {
        locale: 'ru-RU',
        priceFormatter: formatRate,
      },
    })
    const series = chart.addSeries(LineSeries, {
      color: '#55d6a5',
      lineWidth: 2,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#0d1117',
      crosshairMarkerBackgroundColor: '#55d6a5',
      lastValueVisible: true,
      priceLineVisible: true,
    })

    chartRef.current = chart
    seriesRef.current = series

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return
    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [data])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return undefined

    const priceLines = levels.map(({ price }, index) =>
      series.createPriceLine({
        price,
        color: index % 2 === 0 ? '#e5b567' : '#9d8bff',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Уровень ${index + 1}`,
      }),
    )

    return () => priceLines.forEach((line) => series.removePriceLine(line))
  }, [levels])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    const overlay = overlayRef.current
    const container = containerRef.current
    if (!chart || !series || !overlay || !container) return undefined

    const updateTrendLines = () => {
      const lineElements = trendLines
        .map((line) => ({
          x1: chart.timeScale().timeToCoordinate(line.from.time),
          y1: series.priceToCoordinate(line.from.price),
          x2: chart.timeScale().timeToCoordinate(line.to.time),
          y2: series.priceToCoordinate(line.to.price),
        }))
        .filter(({ x1, y1, x2, y2 }) =>
          [x1, y1, x2, y2].every(Number.isFinite),
        )
        .map(({ x1, y1, x2, y2 }) => {
          const element = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          element.setAttribute('x1', String(x1))
          element.setAttribute('y1', String(y1))
          element.setAttribute('x2', String(x2))
          element.setAttribute('y2', String(y2))
          element.setAttribute('stroke', '#9d8bff')
          element.setAttribute('stroke-width', '2')
          element.setAttribute('stroke-dasharray', '6 5')

          return element
        })

      overlay.replaceChildren(...lineElements)
    }

    updateTrendLines()
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateTrendLines)
    const observer = new ResizeObserver(updateTrendLines)
    observer.observe(container)

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateTrendLines)
      observer.disconnect()
      overlay.replaceChildren()
    }
  }, [data, trendLines])

  const handleClick = (event) => {
    const chart = chartRef.current
    const series = seriesRef.current
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!chart || !series || !bounds || !activeTool) return

    const point = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }
    const time = chart.timeScale().coordinateToTime(point.x)
    const price = series.coordinateToPrice(point.y)
    if (time === null || price === null) return
    onChartClick({ time, price })
  }

  return (
    <div
      className={`chart-canvas${activeTool ? ' chart-canvas--drawing' : ''}`}
      ref={containerRef}
      onClick={handleClick}
      aria-label="График курса валюты"
    >
      <svg className="trend-overlay" ref={overlayRef} aria-hidden="true" />
    </div>
  )
}

function App() {
  const [currency, setCurrency] = useState('R01235')
  const [period, setPeriod] = useState(periods[2])
  const [retryToken, setRetryToken] = useState(0)
  const [request, setRequest] = useState({ key: null, rates: [], error: '' })
  const [activeTool, setActiveTool] = useState(null)
  const [pendingTrendStart, setPendingTrendStart] = useState(null)
  const [levels, setLevels] = useState([])
  const [trendLines, setTrendLines] = useState([])
  const requestKey = `${currency}:${period.days}:${retryToken}`
  const loading = request.key !== requestKey
  const rates = request.rates
  const error = loading ? '' : request.error

  useEffect(() => {
    const controller = new AbortController()
    const key = `${currency}:${period.days}:${retryToken}`
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    fetch(
      `/api/cbr/rates?currency=${encodeURIComponent(currency)}&from=${from}&to=${to}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) {
          throw new Error(body.error || 'Не удалось загрузить курс валюты.')
        }
        return body
      })
      .then((body) => {
        setRequest({ key, rates: body.rates, error: '' })
        setLevels([])
        setTrendLines([])
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') {
          setRequest({ key, rates: [], error: fetchError.message })
        }
      })

    return () => controller.abort()
  }, [currency, period, retryToken])

  const currentCurrency = currencies.find((item) => item.code === currency)
  const latest = rates.at(-1)
  const previous = rates.at(-2)
  const change = latest && previous ? latest.value - previous.value : 0
  const changePercent =
    latest && previous && previous.value !== 0
      ? (change / previous.value) * 100
      : 0

  const handleChartClick = (point) => {
    if (activeTool === 'horizontal') {
      setLevels((current) => [...current, { price: point.price }])
      setActiveTool(null)
      return
    }

    if (activeTool === 'trend') {
      if (pendingTrendStart) {
        setTrendLines((current) => [
          ...current,
          { from: pendingTrendStart, to: point },
        ])
        setPendingTrendStart(null)
        setActiveTool(null)
      } else {
        setPendingTrendStart(point)
      }
    }
  }

  const toggleTool = (tool) => {
    setPendingTrendStart(null)
    setActiveTool((current) => (current === tool ? null : tool))
  }

  return (
    <main className="terminal">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Курс — главная">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 17.5 9 12l3.5 3.5L20 7" />
              <path d="M15.5 7H20v4.5" />
            </svg>
          </span>
          <span>КУРС</span>
        </a>
        <div className="market-status">
          <span className="status-dot" />
          Данные ЦБ РФ
        </div>
      </header>

      <section className="workspace">
        <div className="instrument-heading">
          <div className="instrument-title">
            <div className="currency-badge" aria-hidden="true">
              {currency === 'R01375' ? '¥' : currency === 'R01239' ? '€' : currency === 'R01035' ? '£' : '$'}
            </div>
            <div>
              <div className="pair-name">{currentCurrency?.label}</div>
              <div className="pair-subtitle">{currentCurrency?.name} · Российский рубль</div>
            </div>
          </div>

          <div className="quote">
            <div className="quote-price">
              {latest ? formatRate(latest.value) : '—'}
              <span className="quote-unit"> ₽</span>
            </div>
            <div className={`quote-change${change < 0 ? ' is-negative' : ''}`}>
              {latest && previous ? (
                <>
                  <span>{change >= 0 ? '+' : ''}{formatRate(change)}</span>
                  <span>({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)</span>
                  <span className="change-caption">к предыдущему значению</span>
                </>
              ) : (
                <span>Официальный курс</span>
              )}
            </div>
          </div>

          <label className="currency-select-wrap">
            <span className="sr-only">Валютная пара</span>
            <select
              className="currency-select"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {currencies.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </label>
        </div>

        <section className="chart-card" aria-label="История курса">
          <div className="chart-toolbar">
            <div className="period-tabs" aria-label="Период графика">
              {periods.map((item) => (
                <button
                  className={`period-button${period.label === item.label ? ' is-active' : ''}`}
                  key={item.label}
                  type="button"
                  aria-pressed={period.label === item.label}
                  onClick={() => setPeriod(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="toolbar-divider" />

            <div className="drawing-tools" aria-label="Инструменты рисования">
              <button
                type="button"
                className={`tool-button${activeTool === 'trend' ? ' is-active' : ''}`}
                title="Трендовая линия: выберите две точки на графике"
                aria-label="Нарисовать трендовую линию"
                aria-pressed={activeTool === 'trend'}
                onClick={() => toggleTool('trend')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m3.5 15.5 13-11" />
                  <circle cx="3.5" cy="15.5" r="1.5" />
                  <circle cx="16.5" cy="4.5" r="1.5" />
                </svg>
                <span>Тренд</span>
              </button>
              <button
                type="button"
                className={`tool-button${activeTool === 'horizontal' ? ' is-active' : ''}`}
                title="Горизонтальный уровень: нажмите на нужную цену"
                aria-label="Добавить горизонтальный уровень"
                aria-pressed={activeTool === 'horizontal'}
                onClick={() => toggleTool('horizontal')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3 10h14" />
                  <path d="M5 7v6M15 7v6" />
                </svg>
                <span>Уровень</span>
              </button>
              {(levels.length > 0 || trendLines.length > 0) && (
                <button
                  className="clear-button"
                  type="button"
                  onClick={() => {
                    setLevels([])
                    setTrendLines([])
                    setPendingTrendStart(null)
                    setActiveTool(null)
                  }}
                >
                  Очистить
                </button>
              )}
            </div>
          </div>

          <div className="chart-meta">
            <span>
              <span className="legend-dot" />
              {currentCurrency?.label}
              {latest && <strong>{formatRate(latest.value)} ₽</strong>}
            </span>
            {rates.length > 0 && (
              <span className="date-range">
                {formatDate(rates[0].time)} — {formatDate(rates.at(-1).time)}
              </span>
            )}
          </div>

          <div className="chart-area">
            {rates.length > 0 && (
              <ExchangeChart
                data={rates}
                levels={levels}
                trendLines={trendLines}
                activeTool={activeTool}
                onChartClick={handleChartClick}
              />
            )}
            {loading && (
              <div className="chart-message">
                <span className="spinner" />
                Загружаем данные Центрального банка…
              </div>
            )}
            {!loading && error && (
              <div className="chart-message chart-error" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => setRetryToken((value) => value + 1)}>
                  Повторить
                </button>
              </div>
            )}
            {!loading && !error && rates.length === 0 && (
              <div className="chart-message">За выбранный период данных нет.</div>
            )}
          </div>

          <footer className="chart-footer">
            <span>
              Источник: <a href="https://www.cbr.ru/development/SXML/" target="_blank" rel="noreferrer">Банк России</a>
            </span>
            <span>Официальные дневные курсы · Не является инвестиционной рекомендацией</span>
          </footer>
        </section>

        <div className="notice">
          <span className="notice-icon" aria-hidden="true">i</span>
          <span>
            Это Pet-проект Symfony + React. Email: vadim_lachkov@mail.ru Tg: VadimL23.
          </span>
        </div>
      </section>
    </main>
  )
}

export default App
