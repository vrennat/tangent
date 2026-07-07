import Foundation
import Security

/// Minimal keychain wrapper for the session token. UserDefaults is plaintext on disk;
/// a bearer token that can read/write the account profile belongs in the keychain.
enum KeychainStore {
	private static let service = "page.tangent"

	static func set(_ value: String, for key: String) {
		delete(key)
		let query: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: key,
			kSecValueData as String: Data(value.utf8),
			kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
		]
		SecItemAdd(query as CFDictionary, nil)
	}

	static func get(_ key: String) -> String? {
		let query: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: key,
			kSecReturnData as String: true,
			kSecMatchLimit as String: kSecMatchLimitOne
		]
		var out: AnyObject?
		guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
		      let data = out as? Data else { return nil }
		return String(data: data, encoding: .utf8)
	}

	static func delete(_ key: String) {
		let query: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: key
		]
		SecItemDelete(query as CFDictionary)
	}
}
