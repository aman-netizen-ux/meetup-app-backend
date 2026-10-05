export interface TimeZoneResolver {
  resolve(latitude: number, longitude: number): string;
}
