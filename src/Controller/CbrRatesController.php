<?php

namespace App\Controller;

use DateTimeImmutable;
use DateTimeZone;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

#[AsController]
final class CbrRatesController
{
    private const CURRENCIES = [
        'R01235' => 'USD/RUB',
        'R01239' => 'EUR/RUB',
        'R01035' => 'GBP/RUB',
        'R01375' => 'CNY/RUB',
    ];

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/cbr/rates', name: 'api_cbr_rates', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        $currency = $request->query->getString('currency', 'R01235');
        if (!isset(self::CURRENCIES[$currency])) {
            return new JsonResponse(['error' => 'Unsupported currency.'], JsonResponse::HTTP_BAD_REQUEST);
        }

        $moscow = new DateTimeZone('Europe/Moscow');
        $today = new DateTimeImmutable('today', $moscow);
        $to = $this->parseDate($request->query->getString('to'), $today);
        $from = $this->parseDate($request->query->getString('from'), $today->modify('-1 year'));

        if ($from === null || $to === null || $from > $to || $from->diff($to)->days > 366 * 5) {
            return new JsonResponse(
                ['error' => 'Use valid dates (YYYY-MM-DD) spanning no more than five years.'],
                JsonResponse::HTTP_BAD_REQUEST,
            );
        }

        try {
            $response = $this->httpClient->request('GET', 'https://www.cbr.ru/scripts/XML_dynamic.asp', [
                'query' => [
                    'date_req1' => $from->format('d/m/Y'),
                    'date_req2' => $to->format('d/m/Y'),
                    'VAL_NM_RQ' => $currency,
                ],
                'timeout' => 10,
            ]);
            $xmlContent = $response->getContent();
        } catch (ExceptionInterface $exception) {
            $this->logger->error('Could not fetch exchange rates from the Central Bank of Russia.', [
                'exception' => $exception,
                'currency' => $currency,
            ]);

            return new JsonResponse(
                ['error' => 'The Central Bank rate service is temporarily unavailable. Please try again later.'],
                JsonResponse::HTTP_BAD_GATEWAY,
            );
        }

        $previousLibxmlSetting = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($xmlContent, \SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOCDATA);
        libxml_clear_errors();
        libxml_use_internal_errors($previousLibxmlSetting);

        if ($xml === false) {
            $this->logger->error('The Central Bank returned invalid XML.', ['currency' => $currency]);

            return new JsonResponse(
                ['error' => 'The Central Bank returned data in an unexpected format.'],
                JsonResponse::HTTP_BAD_GATEWAY,
            );
        }

        $rates = [];
        foreach ($xml->Record as $record) {
            $date = DateTimeImmutable::createFromFormat('!d.m.Y', (string) $record['Date'], $moscow);
            $nominal = (int) $record->Nominal;
            $value = (float) str_replace(',', '.', (string) $record->Value);

            if ($date !== false && $nominal > 0) {
                $rates[] = [
                    'time' => $date->format('Y-m-d'),
                    'value' => $value / $nominal,
                ];
            }
        }

        return new JsonResponse([
            'currency' => $currency,
            'label' => self::CURRENCIES[$currency],
            'rates' => $rates,
        ]);
    }

    private function parseDate(string $value, DateTimeImmutable $default): ?DateTimeImmutable
    {
        if ($value === '') {
            return $default;
        }

        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Europe/Moscow'));

        return $date !== false && $date->format('Y-m-d') === $value ? $date : null;
    }
}
